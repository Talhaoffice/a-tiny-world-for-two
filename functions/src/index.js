import { initializeApp } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'
import * as functions from 'firebase-functions/v1'
import { logger } from 'firebase-functions'
import { applyResolvedAttack, applyResolvedCombatInteraction, cleanProcessedRequests, completeCombatRespawn, HOME_RESPAWN_POSITION, isAuthorizedAttackEvent, validateAttack, validateCombatInteraction } from './combatCore.js'

initializeApp()

const db = getDatabase()
const MEMBER_PATH = uid => `members/${uid}`
const PLAYER_PATH = uid => `world/players/${uid}`
const LOADOUT_PATH = uid => `world/combat/loadouts/${uid}`
const COMBAT_STATE_PATH = 'world/combat/state'

function validPosition(position, now) {
  return position && Number.isFinite(position.x) && Number.isFinite(position.y)
    && Number.isFinite(position.updatedAt) && now - position.updatedAt <= 15_000
    && position.updatedAt <= now + 1_000 && position.x >= 0 && position.x <= 1536
    && position.y >= 0 && position.y <= 1024
    && (position.zone === 'island' || position.zone === 'home')
}

function authorizationFailure({ authType, authUid, pathUid, actorIsMember, targetIsMember }) {
  if (authType !== 'app_user') return 'event-auth-type'
  if (typeof authUid !== 'string' || authUid.length === 0) return 'event-auth-identity-missing'
  if (authUid !== pathUid) return 'event-owner-mismatch'
  if (actorIsMember !== true) return 'actor-not-member'
  if (targetIsMember !== true) return 'target-not-member'
  return null
}

export const resolvePlayerAttack = functions.database
  .ref('/world/combat/requests/attacks/{uid}/{requestId}')
  .onCreate(async (snapshot, context) => {
    const { uid, requestId } = context.params
    const request = snapshot.val()
    const requestRef = snapshot.ref
    const eventAuthType = context.authType === 'USER' ? 'app_user'
      : context.authType === 'ADMIN' ? 'admin'
        : context.authType === 'UNAUTHENTICATED' ? 'unauthenticated'
          : 'unknown'
    const authUid = eventAuthType === 'app_user' ? context.auth?.uid ?? null : null
    const now = Date.now()

    try {
      const actorIsMember = (await db.ref(MEMBER_PATH(uid)).get()).val() === true
      const targetUid = typeof request?.targetUid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(request.targetUid) ? request.targetUid : null
      const targetIsMember = targetUid !== null && (await db.ref(MEMBER_PATH(targetUid)).get()).val() === true
      const authFailure = authorizationFailure({
        authType: eventAuthType,
        authUid,
        pathUid: uid,
        actorIsMember,
        targetIsMember,
      })
      if (authFailure || !isAuthorizedAttackEvent({ authType: eventAuthType, authUid, pathUid: uid, actorIsMember, targetIsMember })) {
        logger.warn('combat/request-rejected', {
          code: 'unauthorized',
          category: authFailure ?? 'authorization-predicate',
          eventAuthType,
          actorIsMember,
          targetIsMember,
        })
        await requestRef.remove()
        return
      }
      if (!request || typeof request.targetUid !== 'string' || request.targetUid === uid
        || !['up', 'down', 'left', 'right'].includes(request.facing)
        || !Number.isFinite(request.createdAt) || Math.abs(now - request.createdAt) > 8_000) {
        logger.warn('combat/request-rejected', { code: 'invalid-request' })
        await requestRef.remove()
        return
      }

      if (typeof targetUid !== 'string') {
        logger.warn('combat/request-rejected', { code: 'invalid-target' })
        await requestRef.remove()
        return
      }
      const [attackerSnapshot, targetSnapshot, loadoutSnapshot] = await Promise.all([
        db.ref(PLAYER_PATH(uid)).get(),
        db.ref(PLAYER_PATH(targetUid)).get(),
        db.ref(LOADOUT_PATH(uid)).get(),
      ])
      const attackerPlayer = attackerSnapshot.val()
      const targetPlayer = targetSnapshot.val()
      const attackerPosition = attackerPlayer?.position
      const targetPosition = targetPlayer?.position
      const isOnline = player => player?.presence?.online === true
        && Number.isFinite(player?.presence?.lastChanged) && now - player.presence.lastChanged <= 120_000
      const weapon = loadoutSnapshot.val()?.weapon
      const safelyLocated = isOnline(attackerPlayer) && isOnline(targetPlayer)
        && validPosition(attackerPosition, now) && validPosition(targetPosition, now)
      let resolution = { ok: false, reason: 'stale-position' }
      const transaction = await db.ref(COMBAT_STATE_PATH).transaction(current => {
        const currentState = current ?? { players: {}, processed: {} }
        resolution = safelyLocated
          ? validateAttack({
              actorUid: uid,
              targetUid,
              request: { weapon, facing: request.facing },
              attackerPosition,
              targetPosition,
              attackerState: currentState.players?.[uid],
              targetState: currentState.players?.[targetUid],
              now,
            })
          : { ok: false, reason: 'stale-position' }
        const result = applyResolvedAttack(currentState, uid, targetUid, requestId, resolution, now)
        result.state.processed = cleanProcessedRequests(result.state.processed, now)
        return result.state
      })
      if (transaction.committed) logger.info('combat/request-resolved', { code: resolution.ok ? 'hit' : resolution.reason })
      await requestRef.remove()
    } catch (error) {
      logger.error('combat/request-failed', { code: typeof error?.code === 'string' ? error.code : 'internal' })
      throw error
    }
  })

export const resolveCombatInteraction = functions.runWith({ failurePolicy: true }).database
  .ref('/world/combat/requests/interactions/{uid}/{requestId}')
  .onCreate(async (snapshot, context) => {
    const { uid, requestId } = context.params
    const request = snapshot.val()
    const requestRef = snapshot.ref
    const eventAuthType = context.authType === 'USER' ? 'app_user'
      : context.authType === 'ADMIN' ? 'admin'
        : context.authType === 'UNAUTHENTICATED' ? 'unauthenticated'
          : 'unknown'
    const authUid = eventAuthType === 'app_user' ? context.auth?.uid ?? null : null
    const now = Date.now()

    try {
      const targetUid = typeof request?.targetUid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(request.targetUid) ? request.targetUid : null
      const [actorMember, targetMember] = await Promise.all([
        db.ref(MEMBER_PATH(uid)).get(),
        targetUid ? db.ref(MEMBER_PATH(targetUid)).get() : Promise.resolve(null),
      ])
      const actorIsMember = actorMember.val() === true
      const targetIsMember = targetMember?.val() === true
      const authorization = isAuthorizedAttackEvent({ authType: eventAuthType, authUid, pathUid: uid, actorIsMember, targetIsMember })
      if (!authorization) {
        logger.warn('combat/interaction-rejected', {
          code: 'unauthorized',
          eventAuthType,
          actorIsMember,
          targetIsMember,
          ownerMatches: authUid === uid,
        })
        await requestRef.remove()
        return
      }
      if (!targetUid || targetUid === uid || !['pickup', 'throw'].includes(request?.action)
        || !Number.isFinite(request?.createdAt) || Math.abs(now - request.createdAt) > 8_000) {
        logger.warn('combat/interaction-rejected', { code: 'invalid-request' })
        await requestRef.remove()
        return
      }

      const [actorPlayerSnapshot, targetPlayerSnapshot] = await Promise.all([
        db.ref(PLAYER_PATH(uid)).get(),
        db.ref(PLAYER_PATH(targetUid)).get(),
      ])
      const actorPlayer = actorPlayerSnapshot.val()
      const targetPlayer = targetPlayerSnapshot.val()
      const isOnline = player => player?.presence?.online === true
        && Number.isFinite(player?.presence?.lastChanged) && now - player.presence.lastChanged <= 120_000
      let resolution = { ok: false, reason: 'stale-position' }
      let interactionResult
      const transaction = await db.ref(COMBAT_STATE_PATH).transaction(current => {
        const currentState = current ?? { players: {}, processed: {} }
        resolution = validateCombatInteraction({
          actorUid: uid,
          targetUid,
          action: request.action,
          actorPosition: actorPlayer?.position,
          targetPosition: targetPlayer?.position,
          actorOnline: isOnline(actorPlayer),
          targetOnline: isOnline(targetPlayer),
          actorState: currentState.players?.[uid],
          targetState: currentState.players?.[targetUid],
          now,
        })
        interactionResult = applyResolvedCombatInteraction(currentState, uid, targetUid, requestId, resolution, now)
        interactionResult.state.processed = cleanProcessedRequests(interactionResult.state.processed, now)
        return interactionResult.state
      })

      if (!transaction.committed) throw new Error('Combat interaction transaction did not commit.')
      const processedOutcome = transaction.snapshot.child(`processed/${uid}:${requestId}`).child('result').val()
      if (interactionResult.reason === 'duplicate' && processedOutcome !== 'respawning') {
        logger.info('combat/interaction-ignored', { code: 'duplicate' })
        await requestRef.remove()
        return
      }

      if (processedOutcome === 'respawning') {
        await db.ref(PLAYER_PATH(targetUid)).update({
          position: { ...HOME_RESPAWN_POSITION, updatedAt: Date.now() },
        })
        const completedAt = Date.now()
        const completion = await db.ref(COMBAT_STATE_PATH).transaction(current =>
          completeCombatRespawn(current, uid, targetUid, requestId, completedAt))
        if (!completion.committed || completion.snapshot.child(`processed/${uid}:${requestId}`).child('result').val() !== 'respawned') {
          throw new Error('Combat respawn finalization did not commit.')
        }
      }

      logger.info('combat/interaction-resolved', { code: processedOutcome === 'respawned' || interactionResult.reason === 'respawning' ? 'respawned' : interactionResult.reason })
      await requestRef.remove()
    } catch (error) {
      logger.error('combat/interaction-failed', { code: typeof error?.code === 'string' ? error.code : 'internal' })
      throw error
    }
  })
