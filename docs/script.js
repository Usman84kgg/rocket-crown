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

function showPage(page){


document.getElementById("home-page").style.display="none";

document.getElementById("casino-page").style.display="none";

document.getElementById("wallet-page").style.display="none";

document.getElementById("profile-page").style.display="none";


if(page==="home"){

document.getElementById("home-page").style.display="block";

}


if(page==="casino"){

document.getElementById("casino-page").style.display="block";

}


if(page==="wallet"){

document.getElementById("wallet-page").style.display="block";

}


if(page==="profile"){

document.getElementById("profile-page").style.display="block";

}


}


// ГЛАВНАЯ СТРАНИЦА ОТКРЫТА ПО УМОЛЧАНИЮ

showPage("home");