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

/*=============== EMAIL JS ===============*/
const contactForm = document.getElementById('contact-form'),
    contactMessage = document.getElementById('contact-message')

// Send email to yourself
const sendEmail = (event) => {
    event.preventDefault()

    // Send email to yourself
    emailjs.sendForm('service_obsgdao', 'template_vk9tpdr', '#contact-form', 'nR5d5T3c8oH0B55An')
        .then(() => {
            // Show sent message
            contactMessage.textContent = "Message sent successfully ✅"

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
    emailjs.send('service_obsgdao', 'template_9uhgscf', templateParams, 'nR5d5T3c8oH0B55An')
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
const sr = ScrollReveal({
    origin: 'top',
    distance: '60px',
    duration: 2500,
    delay: 400,
    // reset: true // Animations repeat
})

sr.reveal(`.home__profile, .about__image, .contact__mail`, { origin: "right" })
sr.reveal(`.home__name, .home__info, .about__container .section-title-1, .about__info, .contact__social, .contact__data`, { origin: "left" })
sr.reveal(`.skills__content:nth-child(1), .skills__content:nth-child(3)`, { origin: "left" })
sr.reveal(`.skills__content:nth-child(2), .skills__content:nth-child(4)`, { origin: "right" })
sr.reveal(`.qualification__content`, { interval: 100 })

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

    const stopAuto = () => {
        clearInterval(autoTimer)
        autoTimer = 0
    }

    const startAuto = () => {
        stopAuto()
        // Respect a reduced-motion preference by not rotating at all.
        if (reduceMotion.matches) return
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
    startAuto()
}
