// =====================
// ROCKET CROWN
// =====================

setTimeout(() => {
  document.getElementById("loading-screen").style.display = "none";
  document.getElementById("main-app").style.display = "block";
}, 2000);

let userLevel = 1;
let totalBalanceUSD = 0.00;

function updateBalance() {
  const balanceElement = document.querySelector(".balance");
  if (balanceElement) {
    balanceElement.innerHTML = "$" + totalBalanceUSD.toFixed(2);
  }
}

function updateLevel() {
  const levelElement = document.querySelector(".level");
  if (levelElement) {
    levelElement.innerHTML = "LVL " + userLevel;
  }
}

const menuButton = document.getElementById("menuButton");
const topMenu = document.getElementById("topMenu");
if (menuButton && topMenu) {
  menuButton.addEventListener("click", () => {
    topMenu.classList.toggle("open");
  });
}

updateBalance();
updateLevel();
