// todo
const button = document.createElement("button");
button.textContent = " Click";
document.body.appendChild(button);
button.addEventListener("click", () => {
  alert("You did it!");
});
