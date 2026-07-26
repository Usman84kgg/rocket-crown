// ======================
// LOADING SCREEN
// ======================

setTimeout(function () {

document.getElementById("loading-screen").style.display = "none";
document.getElementById("main-app").style.display = "block";

},2000);


// ======================
// USER DATA
// ======================

let userLevel = 1;

let totalBalanceUSD = 0.00;


// ======================
// ОБНОВЛЕНИЕ БАЛАНСА
// ======================

function updateBalance(){

const balanceElement = document.querySelector(".top-balance");

if(balanceElement){

balanceElement.innerHTML =
"$" + totalBalanceUSD.toFixed(2);

}

}


// ======================
// ОБНОВЛЕНИЕ VIP
// ======================

function updateLevel(){

const levelElement = document.querySelector(".top-level");

if(levelElement){

levelElement.innerHTML =
"LVL " + userLevel;

}

}


// ======================
// КУРСЫ КРИПТЫ
// ======================

// ПОЗЖЕ ПОДКЛЮЧИМ COINGECKO API

function updateCryptoPrices(){

console.log("Crypto Prices Ready.");

}


// ======================
// ДЕПОЗИТ
// ======================

function depositCrypto(){

console.log("Deposit Ready.");

}


// ======================
// ВЫВОД
// ======================

function withdrawCrypto(){

console.log("Withdraw Ready.");

}


// ======================
// JACKPOT
// ======================

function updateJackpot(){

console.log("Jackpot Ready.");

}


// ======================
// LIVE WINS
// ======================

function updateLiveWins(){

console.log("Live Wins Ready.");

}


// ======================
// CASHBACK
// ======================

function updateCashback(){

console.log("Cashback Ready.");

}


// ======================
// PROMO CODES
// ======================

function activatePromoCode(){

console.log("Promo Ready.");

}


// ======================
// TELEGRAM WALLET
// ======================

function connectTelegramWallet(){

console.log("Telegram Wallet Ready.");

}


// ======================
// TON CONNECT
// ======================

function connectTONConnect(){

console.log("TON Connect Ready.");

}


// ======================
// VIP SYSTEM
// ======================

function updateVIP(){

console.log("VIP Ready.");

}


// ======================
// REFERRAL SYSTEM
// ======================

function updateReferral(){

console.log("Referral Ready.");

}


// ======================
// START APP
// ======================

updateBalance();
updateLevel();