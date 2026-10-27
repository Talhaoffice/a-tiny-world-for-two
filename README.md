\# 🌸 A Tiny World for Two



A cozy, pixel-art multiplayer web experience where two people share a private virtual island, explore together, and build their own little world.



<p align="center">

&#x20; <a href="https://a-tiny-world-for-two.web.app">

&#x20;   <strong>🌐 Play the Live Demo</strong>

&#x20; </a>

</p>



\---



\## 📖 About the Project



\*\*A Tiny World for Two\*\* is a personalized interactive web application designed to create a shared digital space for two people. Inspired by cozy pixel-art simulation games, it combines exploration, character movement, and real-time multiplayer synchronization.



The goal is to create a small, welcoming world that feels personal, playful, and shared.



\## ✨ Features



\- 🏝️ \*\*Interactive Island:\*\* Explore a pixel-art island environment.

\- 🚶 \*\*Character Movement:\*\* Move around the world using keyboard controls.

\- 👥 \*\*Real-Time Multiplayer:\*\* Synchronize player presence and positions.

\- 🔐 \*\*Private Authentication:\*\* Firebase Authentication protects access.

\- 🌿 \*\*Shared World:\*\* Both authorized players can explore the same environment.

\- 🗃️ \*\*Firebase Integration:\*\* Store and synchronize game data.

\- 🛡️ \*\*Database Security:\*\* Firebase Security Rules restrict unauthorized access.

\- 🐾 \*\*Pet Features:\*\* Pet-related functionality is part of the project development.



\## 🛠️ Technology Stack



| Technology | Purpose |

|---|---|

| React | User interface |

| TypeScript | Type-safe application development |

| Phaser | Interactive game environment |

| Vite | Development server and build tooling |

| Firebase Authentication | User authentication |

| Firebase Realtime Database | Real-time player synchronization |

| Cloud Firestore | Structured application data |

| Firebase Hosting | Application deployment |



\## 📸 Screenshots



\### Welcome Page



!\[Welcome Page](screen%20shot/front%20page.png)



\### Login Page



!\[Login Page](screen%20shot/log%20in%20page.png)



\### Main Application



!\[Main Application](screen%20shot/main%20page.png)



\## 🎮 Controls



| Control | Action |

|---|---|

| W / A / S / D | Move your character |

| Arrow Keys | Alternative movement controls |

| E | Explore or interact where supported |



\*Controls may vary depending on the current implementation.\*



\## 🚀 Run Locally



\### Prerequisites



\- Node.js

\- npm

\- A Firebase project with the required services configured



\### 1. Clone the repository



```bash

git clone https://github.com/Talhaoffice/a-tiny-world-for-two.git

cd a-tiny-world-for-two

```



\### 2. Install dependencies



```bash

npm install

```



\### 3. Configure environment variables



Create a local `.env` file in the project root with the Firebase configuration variables expected by the application:



```env

VITE\_FIREBASE\_API\_KEY=your-firebase-api-key

VITE\_FIREBASE\_AUTH\_DOMAIN=your-project-id.firebaseapp.com

VITE\_FIREBASE\_DATABASE\_URL=https://your-project-id-default-rtdb.firebaseio.com

VITE\_FIREBASE\_PROJECT\_ID=your-project-id

VITE\_FIREBASE\_APP\_ID=your-firebase-app-id

```



Replace the example values with your own Firebase project's configuration.



\*\*Security:\*\* Never commit your real `.env` file, private service-account credentials, or passwords. Client-side Firebase configuration must be protected by correctly configured Firebase Security Rules.



\### 4. Configure Firebase



Enable the Firebase services required by the application and configure the relevant database rules.



The application uses a restricted account setup rather than an open public registration flow. Configure authorized accounts and any required membership records before testing multiplayer access.



\### 5. Start the development server



```bash

npm run dev

```



Open the local address printed in your terminal.



\## 🧪 Testing and Build



\### TypeScript Check



```bash

npm run typecheck

```



\### Security Tests



Run the Firestore and Realtime Database security test suite using Firebase emulators:



```bash

npm run test:security

```



\### Unit Tests



Run the unit tests:



```bash

npm run test:unit

```



\### End-to-End Tests



Run the two-profile end-to-end test:



```bash

npm run test:e2e

```



\### Production Build



Create a production build. This also runs the TypeScript check:



```bash

npm run build

```



\### Preview the Production Build



```bash

npm run preview

```



\### Deploy to Firebase Hosting



\*\*Only run this when you intend to deploy your changes to the live application.\*\*



```bash

npm run deploy:hosting

```

\## 🔒 Security Considerations



\- Use Firebase Security Rules to control access to application data.

\- Restrict access to authorized users.

\- Keep private credentials outside the repository.

\- Test security rules before deploying changes.

\- Never rely on hiding client-side configuration as the only security measure.



\## 🎯 Project Goals



This project explores:



\- Interactive browser-based game development

\- Real-time multiplayer synchronization

\- Authentication and authorization

\- Firebase database integration

\- Pixel-art environments and cozy game experiences

\- Deployment of a full-stack interactive web application



\## 👨‍💻 Developer



\*\*Talha Shaikh\*\*



Personal project focused on interactive web development, game mechanics, real-time synchronization, and Firebase integration.



\---



\*\*Live Demo:\*\* https://a-tiny-world-for-two.web.app  

\*\*Source Code:\*\* https://github.com/Talhaoffice/a-tiny-world-for-two

