(function () {
  var hd = document.querySelector('.hd');
  var bg = document.querySelector('.burger');
  if (bg && hd) {
    bg.addEventListener('click', function () {
      var open = hd.classList.toggle('open');
      bg.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    hd.querySelectorAll('.drawer a, .hd-m .cta').forEach(function (link) {
      link.addEventListener('click', function () {
        hd.classList.remove('open');
        bg.setAttribute('aria-expanded', 'false');
      });
    });
  }

  var EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  function postForm(form, err, onOk) {
    var btn = form.querySelector('[type="submit"]');
    if (btn) btn.disabled = true;
    fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
      headers: { Accept: 'application/json', 'X-Requested-With': 'fetch' }
    }).then(function (response) {
      return response.json().then(function (payload) {
        return { ok: response.ok, payload: payload };
      }).catch(function () {
        return { ok: false, payload: null };
      });
    }).then(function (result) {
      if (btn) btn.disabled = false;
      if (!result.payload || !result.payload.ok) {
        if (err) err.textContent = (result.payload && result.payload.message) || 'Envoi impossible.';
        return;
      }
      if (err) err.textContent = '';
      onOk(result.payload);
    }).catch(function () {
      if (btn) btn.disabled = false;
      if (err) err.textContent = 'Envoi impossible. Réessayez.';
    });
  }

  document.querySelectorAll('form.wl').forEach(function (form) {
    var box = form.closest('.waitlist');
    var ok = box.querySelector('.ok');
    var err = box.querySelector('.err');
    form.addEventListener('submit', function (event) {
      if (!window.fetch) return;
      event.preventDefault();
      var value = form.email.value.trim();
      if (!EMAIL.test(value)) {
        err.textContent = 'Adresse e-mail invalide.';
        return;
      }
      err.textContent = '';
      postForm(form, err, function (payload) {
        form.hidden = true;
        ok.hidden = false;
        ok.textContent = payload.message;
      });
    });
  });

  var contact = document.getElementById('contact-form');
  if (contact) {
    var subject = contact.sujet.value || 'Question';
    var pills = contact.querySelectorAll('.pill');
    function paint() {
      pills.forEach(function (pill) {
        pill.classList.toggle('on', pill.dataset.v === subject);
      });
      contact.sujet.value = subject;
    }
    paint();
    pills.forEach(function (pill) {
      pill.addEventListener('click', function () {
        subject = pill.dataset.v;
        paint();
      });
    });
    contact.addEventListener('submit', function (event) {
      if (!window.fetch) return;
      event.preventDefault();
      var err = contact.querySelector('.err');
      var name = contact.nom.value.trim();
      var email = contact.email.value.trim();
      var message = contact.message.value.trim();
      var problem = !name ? 'Indiquez votre nom.' : !EMAIL.test(email) ? 'Adresse e-mail invalide.' : message.length < 10 ? 'Votre message est un peu court.' : '';
      if (problem) {
        err.textContent = problem;
        return;
      }
      err.textContent = '';
      postForm(contact, err, function (payload) {
        var done = document.getElementById('contact-ok');
        done.querySelector('[data-nom]').textContent = payload.nom || name;
        done.querySelector('[data-email]').textContent = payload.email || email;
        contact.hidden = true;
        done.hidden = false;
      });
    });
  }

  var filters = document.querySelectorAll('[data-filter]');
  filters.forEach(function (button) {
    button.addEventListener('click', function () {
      var category = button.dataset.filter;
      filters.forEach(function (item) {
        item.classList.toggle('on', item === button);
      });
      document.querySelectorAll('[data-cat]').forEach(function (card) {
        card.hidden = !(category === 'Tout' || card.dataset.cat === category);
      });
    });
  });

  var lightbox = document.querySelector('.lb');
  if (lightbox) {
    var items = [].slice.call(document.querySelectorAll('.gallery button'));
    var index = 0;
    var image = lightbox.querySelector('img');
    var caption = lightbox.querySelector('.cap');
    function show(next) {
      if (!items.length) return;
      index = (next + items.length) % items.length;
      var source = items[index].querySelector('img');
      image.src = source.src;
      image.alt = source.alt;
      caption.textContent = source.alt;
      lightbox.classList.add('on');
    }
    items.forEach(function (button, itemIndex) {
      button.addEventListener('click', function () { show(itemIndex); });
    });
    lightbox.addEventListener('click', function () { lightbox.classList.remove('on'); });
    lightbox.querySelector('.prev').addEventListener('click', function (event) {
      event.stopPropagation();
      show(index - 1);
    });
    lightbox.querySelector('.next').addEventListener('click', function (event) {
      event.stopPropagation();
      show(index + 1);
    });
    document.addEventListener('keydown', function (event) {
      if (!lightbox.classList.contains('on')) return;
      if (event.key === 'Escape') lightbox.classList.remove('on');
      if (event.key === 'ArrowRight') { event.preventDefault(); show(index + 1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); show(index - 1); }
    });
  }
})();
