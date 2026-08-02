const fs = require('fs');
const path = 'c:\\Users\\sshiv\\.gemini\\antigravity\\scratch\\cricscorer\\src\\index.css';

const styles = `
/* 3D Toggle Component */
.toggle-3d { position: relative; width: 50px; height: 28px; display: inline-block; }
.toggle-3d input { display: none; }

.toggle-track {
  position: absolute;
  inset: 0;
  border-radius: 14px;
  background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.15);
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  cursor: pointer;
}

input:checked + .toggle-track {
  background: linear-gradient(135deg, #e94560, #c73652);
  border-color: #e94560;
  box-shadow: 0 2px 8px rgba(233,69,96,0.4), inset 0 1px 0 rgba(255,255,255,0.2);
}

.toggle-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 2px 4px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.8);
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

input:checked + .toggle-track .toggle-thumb {
  left: 25px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.9);
}

@keyframes slide-up {
  0% { transform: translateY(100%); opacity: 0; }
  100% { transform: translateY(0); opacity: 1; }
}

.animate-slide-up {
  animation: slide-up 0.3s cubic-bezier(0.25, 1, 0.5, 1) forwards;
}
`;

fs.appendFileSync(path, styles);
console.log('Appended successfully');
