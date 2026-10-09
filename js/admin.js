document.querySelectorAll('[data-confirm]').forEach(function (form) {
  form.addEventListener('submit', function (event) {
    if (!window.confirm(form.getAttribute('data-confirm'))) {
      event.preventDefault();
    }
  });
});

document.querySelectorAll('[data-copy]').forEach(function (button) {
  var label = button.textContent;
  button.addEventListener('click', function () {
    var link = button.getAttribute('data-copy');
    var fallback = function () { window.prompt('Copiez le lien :', link); };
    if (!navigator.clipboard) {
      fallback();
      return;
    }
    navigator.clipboard.writeText(link).then(function () {
      button.textContent = 'Lien copié';
    }, fallback);
    setTimeout(function () { button.textContent = label; }, 1800);
  });
});
