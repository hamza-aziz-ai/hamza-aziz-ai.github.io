const navMenu = document.getElementById('nav-menu')
const navToggle = document.getElementById('nav-toggle')
const navClose = document.getElementById('nav-close')
const navLinks = document.querySelectorAll('.nav__link')

if (navToggle && navMenu) {
    navToggle.addEventListener('click', () => navMenu.classList.add('show-menu'))
}

if (navClose && navMenu) {
    navClose.addEventListener('click', () => navMenu.classList.remove('show-menu'))
}

navLinks.forEach(link => link.addEventListener('click', () => {
    if (navMenu) navMenu.classList.remove('show-menu')
}))

const themeButton = document.getElementById('theme-button')
const darkTheme = 'dark-theme'
const iconTheme = 'ri-sun-line'
const transitionOverlay = document.getElementById('page-transition')
const transitionLinks = document.querySelectorAll('a.transition-link')

const selectedTheme = localStorage.getItem('selected-theme')
const selectedIcon = localStorage.getItem('selected-icon')

const getCurrentTheme = () => document.body.classList.contains(darkTheme) ? 'dark' : 'light'
const getCurrentIcon = () => themeButton.classList.contains(iconTheme) ? 'ri-moon-line' : 'ri-sun-line'

if (selectedTheme) {
    document.body.classList[selectedTheme === 'dark' ? 'add' : 'remove'](darkTheme)
    themeButton.classList[selectedIcon === 'ri-moon-line' ? 'add' : 'remove'](iconTheme)
}

themeButton.addEventListener('click', () => {
    document.body.classList.toggle(darkTheme)
    themeButton.classList.toggle(iconTheme)
    localStorage.setItem('selected-theme', getCurrentTheme())
    localStorage.setItem('selected-icon', getCurrentIcon())
})

// Dynamic age calculation
const ageTarget = document.getElementById('age-highlight')
const birthDate = new Date('2001-08-23T00:00:00Z')
if (ageTarget && !Number.isNaN(birthDate)) {
    const today = new Date()
    let age = today.getFullYear() - birthDate.getFullYear()
    const hasNotHadBirthday =
        today.getMonth() < birthDate.getMonth() ||
        (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate())
    if (hasNotHadBirthday) age -= 1
    ageTarget.textContent = age.toString()
}

// Add shadow to header on scroll
const header = document.getElementById('header')
const shadowHeader = () => {
    if (!header) return
    if (window.scrollY >= 50) {
        header.classList.add('shadow-header')
    } else {
        header.classList.remove('shadow-header')
    }
}
window.addEventListener('scroll', shadowHeader)

// Smooth transition back to professional (index) or other transition links
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
