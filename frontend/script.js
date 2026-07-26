// ЗАГРУЗОЧНЫЙ ЭКРАН

setTimeout(function(){

document.getElementById("loading-screen").style.display="none";

document.getElementById("main-app").style.display="block";

},2500);


// АНИМАЦИЯ БАЛАНСА

let balance = 0;

setInterval(() => {

balance += 0.01;

const balanceElement = document.querySelector(".top-balance");

if(balanceElement){

balanceElement.innerHTML = balance.toFixed(2) + " TON";

}

},3000);


// ПЕРЕКЛЮЧЕНИЕ СТРАНИЦ

const PAGES = ["home","casino","wallet","profile"];

function showPage(page){

PAGES.forEach(name => {

const element = document.getElementById(name + "-page");

if(element){

element.style.display = name === page ? "block" : "none";

}

});

}


// ГЛАВНАЯ СТРАНИЦА ОТКРЫТА ПО УМОЛЧАНИЮ

showPage("home");
