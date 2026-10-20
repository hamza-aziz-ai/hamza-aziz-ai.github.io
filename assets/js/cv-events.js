/*=============== CV EVENTS ===============*/
// GA4 events for CV interest, kept separate from generate_lead (a contact
// form message is a lead; taking the CV is not):
//   cv_view      a link to the CV page (/hamza-aziz-cv/)
//   cv_download  a link to the CV PDF
// One click listener on the document, so it also catches links the chat
// adds to its replies. link_location says where the click happened.
// Loaded on index.html, the case studies and chat.html. The CV page (other
// repo) sends the same events with link_location "cv_page".
(function () {
    document.addEventListener('click', event => {
        const link = event.target.closest('a[href]')
        if (!link || typeof gtag !== 'function') return
        let url
        try { url = new URL(link.href, location.href) } catch { return }
        if (url.hostname !== 'hamzaaziz.dev' && url.hostname !== location.hostname) return

        const path = url.pathname
        const name = path.endsWith('/Hamza_Aziz_CV_UAE.pdf') ? 'cv_download'
            : /^\/hamza-aziz-cv\/?$/.test(path) ? 'cv_view'
            : null
        if (!name) return

        const where = link.closest('.chat__panel') ? 'chat'
            : location.pathname.startsWith('/projects/') ? 'case_study'
            : 'homepage'
        gtag('event', name, { link_location: where })
    })
})()
