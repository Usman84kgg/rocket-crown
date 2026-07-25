// =====================
// ROCKET CROWN
// =====================


// ЗАГРУЗОЧНЫЙ ЭКРАН

setTimeout(() => {

document.getElementById("loading-screen").style.display = "none";
document.getElementById("main-app").style.display = "block";

}, 2500);


// =====================
// USER DATA
// =====================

let userBalance = 0.00;

let userLevel = 1;

let userProfit = 0.00;

let cashbackEarned = 0.00;


// =====================
// ОБНОВЛЕНИЕ БАЛАНСА
// =====================

function updateBalance() {

const balanceElement = document.querySelector(".top-balance");

if (balanceElement) {

balanceElement.innerHTML = `$ ${userBalance.toFixed(2)}`;

}

}


// =====================
// ОБНОВЛЕНИЕ VIP LEVEL
// =====================

function updateLevel() {

const levelElement = document.querySelector(".top-level");

if (levelElement) {

levelElement.innerHTML = `LVL ${userLevel}`;

}

}


// =====================
// ОТКРЫТИЕ СТРАНИЦ
// =====================

function openHome() {

window.location.href = "./index.html";

}


function openCasino() {

window.location.href = "./games/index.html";

}


function openWallet() {

window.location.href = "./wallet/index.html";

}


function openProfile() {

window.location.href = "./profile/index.html";

}


// =====================
// ЗАПУСК
// =====================

updateBalance();
updateLevel();


// =====================
// В БУДУЩЕМ
// =====================

// Автоматическое получение курса криптовалют.

// Депозиты.

// Вывод средств.

// VIP система.

// Crown Points.

// Турниры.

// Cashback.

// Referral Program.

// Telegram Mini App.