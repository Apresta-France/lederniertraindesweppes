(function(){
  // Menu mobile
  var hd=document.querySelector('.hd'),bg=document.querySelector('.burger');
  if(bg){bg.addEventListener('click',function(){var o=hd.classList.toggle('open');bg.setAttribute('aria-expanded',o)});
    hd.querySelectorAll('.drawer a,.hd-m .cta').forEach(function(a){a.addEventListener('click',function(){hd.classList.remove('open')})});}
  var EMAIL=/^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  // Liste d'attente — à brancher sur votre service d'inscription (Brevo, Mailchimp…)
  document.querySelectorAll('form.wl').forEach(function(f){
    var box=f.closest('.waitlist'),ok=box.querySelector('.ok'),err=box.querySelector('.err');
    try{if(localStorage.getItem('ldtw_waitlist')){f.hidden=true;err.hidden=true;ok.hidden=false}}catch(e){}
    f.addEventListener('submit',function(e){e.preventDefault();var v=f.email.value.trim();
      if(!EMAIL.test(v)){err.textContent='Adresse e-mail invalide.';return}
      try{localStorage.setItem('ldtw_waitlist',v)}catch(x){}
      f.hidden=true;err.hidden=true;ok.hidden=false;});
  });
  // Formulaire de contact — à brancher sur votre service d'envoi (Formspree, serveur…)
  var cf=document.getElementById('contact-form');
  if(cf){var sujet='Question',pills=cf.querySelectorAll('.pill');
    var q=new URLSearchParams(location.search).get('sujet');
    pills.forEach(function(p){if(q&&p.dataset.v.toLowerCase()===q)sujet=p.dataset.v;});
    function paint(){pills.forEach(function(p){p.classList.toggle('on',p.dataset.v===sujet)});cf.sujet.value=sujet}paint();
    pills.forEach(function(p){p.addEventListener('click',function(){sujet=p.dataset.v;paint()})});
    cf.addEventListener('submit',function(e){e.preventDefault();var er=cf.querySelector('.err'),n=cf.nom.value.trim(),m=cf.email.value.trim(),t=cf.message.value.trim();
      var x=!n?'Indiquez votre nom.':!EMAIL.test(m)?'Adresse e-mail invalide.':t.length<10?'Votre message est un peu court.':'';
      if(x){er.textContent=x;return}
      var d=document.getElementById('contact-ok');d.querySelector('[data-nom]').textContent=n;d.querySelector('[data-email]').textContent=m;cf.hidden=true;d.hidden=false;});
  }
  // Filtres des actualités
  var fl=document.querySelectorAll('[data-filter]');
  fl.forEach(function(b){b.addEventListener('click',function(){var c=b.dataset.filter;
    fl.forEach(function(x){x.classList.toggle('on',x===b)});
    document.querySelectorAll('[data-cat]').forEach(function(a){a.hidden=!(c==='Tout'||a.dataset.cat===c)});});});
  // Galerie
  var lb=document.querySelector('.lb');
  if(lb){var items=[].slice.call(document.querySelectorAll('.gallery button')),i=0,im=lb.querySelector('img'),cap=lb.querySelector('.cap');
    function show(n){i=(n+items.length)%items.length;var s=items[i].querySelector('img');im.src=s.src;im.alt=s.alt;cap.textContent=s.alt;lb.classList.add('on')}
    items.forEach(function(b,n){b.addEventListener('click',function(){show(n)})});
    lb.addEventListener('click',function(){lb.classList.remove('on')});
    lb.querySelector('.prev').addEventListener('click',function(e){e.stopPropagation();show(i-1)});
    lb.querySelector('.next').addEventListener('click',function(e){e.stopPropagation();show(i+1)});
    document.addEventListener('keydown',function(e){if(!lb.classList.contains('on'))return;if(e.key==='Escape')lb.classList.remove('on');if(e.key==='ArrowRight')show(i+1);if(e.key==='ArrowLeft')show(i-1)});}
})();
