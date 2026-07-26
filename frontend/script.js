// ЗАГРУЗОЧНЫЙ ЭКРАН

const PAGE_IDS = {
  home: "home-page",
  casino: "casino-page",
  wallet: "wallet-page",
  profile: "profile-page"
};

function getElement(id) {
  const element = document.getElementById(id);
  if (!element) {
    console.error(`Missing required element #${id}`);
  }
  return element;
}

setTimeout(function () {
  const loadingScreen = getElement("loading-screen");
  const mainApp = getElement("main-app");
  if (loadingScreen) loadingScreen.style.display = "none";
  if (mainApp) mainApp.style.display = "block";
}, 2500);


// АНИМАЦИЯ БАЛАНСА

let balance = 0;

setInterval(() => {
  balance += 0.01;
  const balanceElement = document.querySelector(".top-balance");
  if (balanceElement) {
    balanceElement.innerHTML = balance.toFixed(2) + " TON";
  }
}, 3000);


// ПЕРЕКЛЮЧЕНИЕ СТРАНИЦ

function showPage(page) {
  const targetId = PAGE_IDS[page];
  if (!targetId) {
    console.error(`Unknown page: ${page}`);
    return;
  }

  Object.values(PAGE_IDS).forEach((id) => {
    const element = getElement(id);
    if (element) element.style.display = "none";
  });

  const target = getElement(targetId);
  if (target) target.style.display = "block";
}


// ГЛАВНАЯ СТРАНИЦА ОТКРЫТА ПО УМОЛЧАНИЮ

showPage("home");
