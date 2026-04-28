// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import CharacterWindow from './character/CharacterWindow.jsx';
import ChatWindow from './chat/ChatWindow.jsx';
import './index.css';

const params = new URLSearchParams(window.location.search);
const windowType = params.get('window') || 'character';

const Root = windowType === 'chat' ? ChatWindow : CharacterWindow;

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);
