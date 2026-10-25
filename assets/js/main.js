/*=============== SHOW MENU ===============*/
const navMenu = document.getElementById('nav-menu'),
    navToggle = document.getElementById('nav-toggle'),
    navClose = document.getElementById('nav-close')

/* Menu show */
if (navToggle) {
    navToggle.addEventListener('click', () => {
        navMenu.classList.add('show-menu')
    })
}

/* Menu hidden */
if (navClose) {
    navClose.addEventListener('click', () => {
        navMenu.classList.remove('show-menu')
    })
}

/*=============== REMOVE MENU MOBILE ===============*/
const navLink = document.querySelectorAll('.nav__link')

const linkAction = () => {
    const navMenu = document.getElementById('nav-menu')
    // When we click on each nav__link, we remove the show-menu class
    navMenu.classList.remove('show-menu')
}
navLink.forEach(n => n.addEventListener('click', linkAction))


/*=============== SHADOW HEADER ===============*/
const shadowHeader = () => {
    const header = document.getElementById('header')
    // When the scroll is greater than 50 viewport height, add the shadow-header class to the header tag
    this.scrollY >= 50 ? header.classList.add('shadow-header')
        : header.classList.remove('shadow-header')
}
window.addEventListener('scroll', shadowHeader)

/*=============== CV BY REGION ===============*/
// The HTML gives everyone the UAE CV, so crawlers, link previews and an
// unknown time zone get it. A visitor whose time zone is outside the Gulf
// gets the AI Engineer resume from Download CV instead, and the line above
// the buttons offers the UAE CV. See DECISIONS.md D-018.
const gulfZones = ['Asia/Dubai', 'Asia/Muscat', 'Asia/Qatar', 'Asia/Bahrain', 'Asia/Kuwait', 'Asia/Riyadh'],
    cvDownload = document.querySelector('[data-cv-download]'),
    cvAlt = document.querySelector('[data-cv-alt]')

let visitorZone = ''
try { visitorZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '' } catch { }

if (cvDownload && cvAlt && visitorZone && !gulfZones.includes(visitorZone)) {
    const uaeCv = cvDownload.getAttribute('href')
    cvDownload.setAttribute('href', cvAlt.getAttribute('href'))
    cvAlt.setAttribute('href', uaeCv)
    document.querySelector('[data-cv-alt-question]').textContent = 'Hiring in the Gulf?'
    cvAlt.textContent = 'Get my UAE CV (PDF)'
}

/*=============== EMAIL JS ===============*/
const contactForm = document.getElementById('contact-form'),
    contactMessage = document.getElementById('contact-message')

/* Email address checks before sending. The browser already checks the
   syntax (type="email"); whether the mailbox exists cannot be checked from
   a browser. These catch the next best things: a mistyped popular domain,
   and a domain that cannot receive mail at all. */

// ponytail: short list of popular providers; add any domain visitors keep
// mistyping.
// Real providers are listed even when only one letter apart (ymail/gmail),
// so they are never "corrected" into each other.
const COMMON_DOMAINS = ['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'ymail.com',
    'rocketmail.com', 'outlook.com', 'outlook.in', 'hotmail.com', 'hotmail.co.uk', 'live.com', 'live.in',
    'msn.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'zoho.com',
    'zohomail.in', 'rediffmail.com', 'gmx.com', 'mail.com', 'yandex.com']
let typoWarnedFor = ''

const editDistance = (a, b) => {
    const row = Array.from({ length: b.length + 1 }, (_, j) => j)
    for (let i = 1; i <= a.length; i++) {
        let diagonal = row[0]
        row[0] = i
        for (let j = 1; j <= b.length; j++) {
            const above = row[j]
            row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1))
            diagonal = above
        }
    }
    return row[b.length]
}

// "gmial.com" -> "gmail.com"; null when the domain is fine or nothing is close.
const suggestDomain = domain => {
    if (COMMON_DOMAINS.includes(domain)) return null
    let best = null, bestDistance = 3
    for (const candidate of COMMON_DOMAINS) {
        const distance = editDistance(domain, candidate)
        if (distance < bestDistance) { best = candidate; bestDistance = distance }
    }
    return best
}

// Can the domain receive mail? Asked over DNS-over-HTTPS; only the domain
// leaves the browser. Fails open: a DNS outage or a blocker must never stop
// a real message, and a bad address still bounces back to Hamza.
const domainAcceptsMail = async domain => {
    const lookup = async type => {
        const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`,
            { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(4000) })
        return response.json()
    }
    try {
        const mx = await lookup('MX')
        if (mx.Status === 3) return false // NXDOMAIN: the domain does not exist
        const servers = (mx.Answer || []).filter(record => record.type === 15)
        // A "null MX" (RFC 7505: "0 .") says the domain accepts no mail.
        if (servers.length) return !servers.every(record => /^0 \.?$/.test(record.data.trim()))
        // No MX at all: mail falls back to the domain's own address (RFC 5321).
        const a = await lookup('A')
        return (a.Answer || []).some(record => record.type === 1)
    } catch {
        return true
    }
}

// Offers the corrected address; pressing Send again keeps it as typed.
const showTypoHint = (emailInput, suggestion) => {
    const fixed = `${emailInput.value.trim().split('@')[0]}@${suggestion}`
    const use = document.createElement('button')
    use.type = 'button'
    use.className = 'contact__suggestion'
    use.textContent = fixed
    use.addEventListener('click', () => {
        emailInput.value = fixed
        contactMessage.textContent = ''
        emailInput.focus()
    })
    contactMessage.replaceChildren('Did you mean ', use, '? Or press Send again to keep it as typed.')
}

// Send email to yourself
const sendEmail = async (event) => {
    event.preventDefault()

    const emailInput = document.getElementById('email')
    const domain = emailInput.value.trim().split('@').pop().toLowerCase()
    const suggestion = suggestDomain(domain)
    if (suggestion && typoWarnedFor !== emailInput.value) {
        typoWarnedFor = emailInput.value
        showTypoHint(emailInput, suggestion)
        return
    }
    contactMessage.textContent = 'Checking your email address…'
    if (!(await domainAcceptsMail(domain))) {
        contactMessage.textContent = `"${domain}" can't receive email. Please check your address ❌`
        return
    }
    contactMessage.textContent = 'Sending…'

    // Send email to yourself. emailjs.send with the fields' values, not
    // sendForm: a submitted form turns each line break into \r\n, which the
    // HTML template showed as double blank lines.
    const notifyParams = {
        user_name: document.getElementById('name').value,
        user_email: document.getElementById('email').value,
        user_subject: document.getElementById('subject').value,
        user_message: document.getElementById('message').value,
    }
    emailjs.send('service_lc9tq7j', 'template_axt14ah', notifyParams, 'qaTk8r3XCLMu5l1sG')
        .then(() => {
            // Show sent message
            contactMessage.textContent = "Message sent successfully ✅"

            // GA4 recommended event for a lead. No form content is sent.
            // gtag is absent when analytics is blocked; the form still works.
            if (typeof gtag === 'function') gtag('event', 'generate_lead', { method: 'contact_form' })

            // Send a confirmation email to the user
            sendConfirmationEmail()

            // Remove message after five seconds
            setTimeout(() => {
                contactMessage.textContent = ""
            }, 5000)

            // Clear input fields
            contactForm.reset()

        }, () => {
            // Show error message
            contactMessage.textContent = "Message not sent (service error) ❌"
        })
}

// Send confirmation email to the user
const sendConfirmationEmail = () => {
    // Get user email from the form
    const userEmail = document.getElementById('email').value
    const userName = document.getElementById('name').value
    const userSubject = document.getElementById('subject').value
    const userMessage = document.getElementById('message').value

    // Prepare params for the email template
    const templateParams = {
        from_name: userName,
        subject: userSubject,
        message: userMessage,
        reply_to: userEmail
    }

    // Send the confirmation email
    emailjs.send('service_zdg06yb', 'template_jdxrf2e', templateParams, 'qaTk8r3XCLMu5l1sG')
        .then(() => {
            console.log("Confirmation email sent to the user successfully")
        }, () => {
            console.error("Failed to send confirmation email")
        })
}

contactForm.addEventListener('submit', sendEmail)


/*=============== SHOW SCROLL UP ===============*/
const scrollUp = () => {
    const scrollUp = document.getElementById('scroll-up')
    // When the scroll is higher than 350 viewport height, add the show-scroll class to the a tag with the scrollup class
    this.scrollY >= 350 ? scrollUp.classList.add('show-scroll')
        : scrollUp.classList.remove('show-scroll')
}
window.addEventListener('scroll', scrollUp)

/*=============== SCROLL SECTIONS ACTIVE LINK ===============*/
const sections = document.querySelectorAll('section[id]')

const scrollActive = () => {
    const scrollDown = window.scrollY

    sections.forEach(current => {
        const sectionHeight = current.offsetHeight,
            sectionTop = current.offsetTop - 58,
            sectionId = current.getAttribute('id'),
            sectionsClass = document.querySelector('.nav__menu a[href*=' + sectionId + ']')

        if (scrollDown > sectionTop && scrollDown <= sectionTop + sectionHeight) {
            sectionsClass.classList.add('active-link')
        } else {
            sectionsClass.classList.remove('active-link')
        }
    })
}
window.addEventListener('scroll', scrollActive)

/*=============== DARK LIGHT THEME ===============*/
const themeButton = document.getElementById('theme-button')
const darkTheme = 'dark-theme'
const iconTheme = 'ri-sun-line'

// Previously selected topic (if user selected)
const selectedTheme = localStorage.getItem('selected-theme')
const selectedIcon = localStorage.getItem('selected-icon')

// We obtain the current theme that the interface has by validating the dark-theme class
const getCurrentTheme = () => document.body.classList.contains(darkTheme) ? 'dark' : 'light'
const getCurrentIcon = () => themeButton.classList.contains(iconTheme) ? 'ri-moon-line' : 'ri-sun-line'

// We validate if the user previously chose a topic
if (selectedTheme) {
    // If the validation is fulfilled, we ask what the issue was to know if we activated or deactivated the dark
    document.body.classList[selectedTheme === 'dark' ? 'add' : 'remove'](darkTheme)
    themeButton.classList[selectedIcon === 'ri-moon-line' ? 'add' : 'remove'](iconTheme)
}

// Activate / deactivate the theme manually with the button
themeButton.addEventListener('click', () => {
    // Add or remove the dark / icon theme
    document.body.classList.toggle(darkTheme)
    themeButton.classList.toggle(iconTheme)
    // We save the theme and the current icon that the user chose
    localStorage.setItem('selected-theme', getCurrentTheme())
    localStorage.setItem('selected-icon', getCurrentIcon())
})

/*=============== PAGE TRANSITION TO MATRIMONY ===============*/
const transitionOverlay = document.getElementById('page-transition')
const transitionLinks = document.querySelectorAll('a.transition-link[data-transition="matrimony"]')

const startTransition = (url) => {
    if (!transitionOverlay) {
        window.location.href = url
        return
    }
    document.body.classList.add('is-transitioning')
    setTimeout(() => {
        window.location.href = url
    }, 350)
}

transitionLinks.forEach(link => {
    link.addEventListener('click', (event) => {
        event.preventDefault()
        const url = link.getAttribute('href')
        startTransition(url)
    })
})

/*=============== SCROLL REVEAL ANIMATION ===============*/
// Nothing above the fold is revealed. ScrollReveal sets opacity:0 on its
// targets, and Chrome has ignored opacity-0 paints as Largest Contentful
// Paint candidates since Chrome 86, so revealing .home__* made the hero
// portrait ineligible to count until it repainted -- while index.html asks
// for that same image at fetchpriority="high". Do not add .home__* back.
//
// The whole block is skipped for prefers-reduced-motion. ScrollReveal has no
// reduced-motion handling of its own, so without this guard every section
// fades for 2500ms for a visitor who asked for no motion. See DECISIONS D-008.
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const sr = ScrollReveal({
        origin: 'top',
        distance: '60px',
        duration: 2500,
        delay: 400,
        // reset: true // Animations repeat
    })

    sr.reveal(`.about__image, .contact__mail`, { origin: "right" })
    sr.reveal(`.about__container .section-title-1, .about__info, .contact__social, .contact__data`, { origin: "left" })
    sr.reveal(`.skills__content:nth-child(1), .skills__content:nth-child(3)`, { origin: "left" })
    sr.reveal(`.skills__content:nth-child(2), .skills__content:nth-child(4)`, { origin: "right" })
    sr.reveal(`.projects__container, .qualification__content`, { interval: 100 })
}

/*=============== PROJECTS SLIDER ===============*/
const projectsTrack = document.getElementById('projects-track')

if (projectsTrack) {
    const cards = Array.from(projectsTrack.children)
    const dotsBox = document.getElementById('projects-dots')
    const prevBtn = document.getElementById('projects-prev')
    const nextBtn = document.getElementById('projects-next')

    const offsetOf = card => card.offsetLeft - projectsTrack.offsetLeft

    const activeIndex = () => {
        const x = projectsTrack.scrollLeft
        let best = 0
        cards.forEach((card, i) => {
            if (Math.abs(offsetOf(card) - x) < Math.abs(offsetOf(cards[best]) - x)) best = i
        })
        return best
    }

    // Animate scrollLeft directly rather than relying on scroll-behavior,
    // so the duration is ours and reduced-motion is handled explicitly.
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let animation = 0
    let animating = false

    // Sine in-out. Of the usual curves this has the lowest peak velocity for
    // a given duration (~47px per frame across one card, against ~115 for
    // cubic and ~185 for a quintic ease-out), and peak velocity is what
    // shows up as judder on a wide slide.
    const ease = progress => -(Math.cos(Math.PI * progress) - 1) / 2

    // Scale duration to distance so a one-card step and a jump to the far
    // end both feel deliberate rather than sluggish or abrupt.
    const durationFor = distance => Math.min(900, Math.max(520, distance * 0.55))

    const goTo = i => {
        const index = Math.max(0, Math.min(i, cards.length - 1))
        setActive(index)
        const from = projectsTrack.scrollLeft
        const to = offsetOf(cards[index])
        const distance = to - from
        cancelAnimationFrame(animation)
        if (reduceMotion.matches || Math.abs(distance) < 2) {
            animating = false
            projectsTrack.style.scrollSnapType = ''
            projectsTrack.scrollLeft = to
            return
        }
        const duration = durationFor(Math.abs(distance))
        const started = performance.now()
        animating = true
        // The snap engine re-corrects scrollLeft on every frame we write,
        // which is what makes the glide stutter. Suspend it for the tween.
        projectsTrack.style.scrollSnapType = 'none'
        const step = now => {
            const progress = Math.min((now - started) / duration, 1)
            projectsTrack.scrollLeft = Math.round(from + distance * ease(progress))
            if (progress < 1) {
                animation = requestAnimationFrame(step)
            } else {
                projectsTrack.scrollLeft = to
                projectsTrack.style.scrollSnapType = ''
                animating = false
            }
        }
        animation = requestAnimationFrame(step)
    }

    const dots = cards.map((card, i) => {
        const dot = document.createElement('button')
        dot.className = 'projects__dot'
        dot.type = 'button'
        dot.setAttribute('aria-label', 'Go to project ' + (i + 1))
        dot.addEventListener('click', () => goManual(i))
        dotsBox.appendChild(dot)
        return dot
    })

    // Driven from the target index, not from scrollLeft: during a tween the
    // scroll position has not arrived yet, and a disabled button never fires.
    const setActive = i => {
        dots.forEach((dot, j) => dot.setAttribute('aria-current', j === i ? 'true' : 'false'))
        prevBtn.disabled = i === 0
        nextBtn.disabled = i === cards.length - 1
    }

    const sync = () => setActive(activeIndex())

    /* Auto-advance every 10s, wrapping at the end. Manual control is
       unchanged and always wins: any interaction restarts the countdown. */
    const AUTO_INTERVAL = 10000
    let autoTimer = 0
    let held = false
    let inView = false

    const stopAuto = () => {
        clearInterval(autoTimer)
        autoTimer = 0
    }

    const startAuto = () => {
        stopAuto()
        // Respect a reduced-motion preference by not rotating at all, and
        // do not run the clock while the section is off screen.
        if (reduceMotion.matches || !inView) return
        autoTimer = setInterval(() => {
            // Skip while pointed at, focused, or in a background tab: a
            // hidden tab has no frame loop, so the tween could not run.
            if (held || document.hidden) return
            goTo((activeIndex() + 1) % cards.length)
        }, AUTO_INTERVAL)
    }

    // Pause mechanism (WCAG 2.2.2): hovering or focusing holds the rotation
    // so a slide cannot change out from under someone reading it.
    const hold = () => { held = true }
    const release = () => { held = false }
    const slider = projectsTrack.parentElement
    slider.addEventListener('mouseenter', hold)
    slider.addEventListener('mouseleave', release)
    slider.addEventListener('focusin', hold)
    slider.addEventListener('focusout', release)
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stopAuto()
        else startAuto()
    })

    const goManual = i => {
        goTo(i)
        startAuto()
    }

    prevBtn.addEventListener('click', () => goManual(activeIndex() - 1))
    nextBtn.addEventListener('click', () => goManual(activeIndex() + 1))

    projectsTrack.addEventListener('keydown', event => {
        if (event.key === 'ArrowRight') {
            event.preventDefault()
            goManual(activeIndex() + 1)
        }
        if (event.key === 'ArrowLeft') {
            event.preventDefault()
            goManual(activeIndex() - 1)
        }
    })

    let ticking = false
    projectsTrack.addEventListener('scroll', () => {
        if (ticking || animating) return
        ticking = true
        requestAnimationFrame(() => {
            sync()
            ticking = false
        })
    })

    window.addEventListener('resize', () => goTo(activeIndex()))
    sync()

    // Start the countdown when the section is actually reached, so the
    // first slide is not already two projects along by the time it is seen.
    if ('IntersectionObserver' in window) {
        new IntersectionObserver(entries => {
            inView = entries[0].isIntersecting
            if (inView) startAuto()
            else stopAuto()
        }, { threshold: 0.3 }).observe(projectsTrack)
    } else {
        inView = true
        startAuto()
    }
}
