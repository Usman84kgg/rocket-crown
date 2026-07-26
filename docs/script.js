const menuButton = document.getElementById('menuButton');
const menuPanel = document.getElementById('menuPanel');
const navButtons = document.querySelectorAll('.nav-btn');
const screens = document.querySelectorAll('.screen');

function showScreen(screenId) {
  screens.forEach((screen) => {
    screen.classList.toggle('active', screen.id === screenId);
  });

  navButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.screen === screenId.replace('Screen', '').toLowerCase());
  });
}

if (menuButton && menuPanel) {
  menuButton.addEventListener('click', () => {
    menuPanel.classList.toggle('open');
  });

  document.addEventListener('click', (event) => {
    if (!menuPanel.contains(event.target) && event.target !== menuButton) {
      menuPanel.classList.remove('open');
    }
  });
}

navButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const screenId = button.dataset.screen + 'Screen';
    showScreen(screenId);
  });
});

showScreen('homeScreen');
