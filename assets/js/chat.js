/*=============== CHAT ASSISTANT ===============*/
// Floating "Ask about Hamza" chat. Talks to the Cloudflare Worker in
// worker/, which holds the model key; nothing secret lives here.
//
// The Worker URL comes from this script tag's data-endpoint. While it is
// empty the widget renders nothing, so this file can ship before the
// Worker is deployed.
(function () {
    const script = document.currentScript
    const endpoint = script && script.dataset.endpoint
    if (!endpoint) return

    const SUGGESTIONS = [
        "Tell me something that's not on your resume",
        'What was the hardest problem you solved?',
        'Are you open to roles in the UAE?',
    ]
    // Greeting is UI-only and never sent upstream: the conversation sent to
    // the model must start with a visitor message.
    const GREETING = "Hi, I'm Hamza's AI assistant. I answer as Hamza would, from his portfolio and his own engineering notes. Ask about his projects, decisions or experience."

    const history = []
    let busy = false

    const launcher = el('button', {
        class: 'chat__launcher', type: 'button',
        'aria-label': 'Ask about Hamza', 'aria-expanded': 'false', 'aria-controls': 'chat-panel',
    }, [el('i', { class: 'ri-chat-3-line', 'aria-hidden': 'true' })])

    const log = el('div', { class: 'chat__log', 'aria-live': 'polite' })
    const input = el('textarea', {
        class: 'chat__input', rows: '1', maxlength: '800',
        placeholder: 'Ask about my projects, decisions…', 'aria-label': 'Your question',
    })
    const send = el('button', { class: 'chat__send', type: 'submit', 'aria-label': 'Send' },
        [el('i', { class: 'ri-send-plane-2-line', 'aria-hidden': 'true' })])
    const form = el('form', { class: 'chat__form' }, [input, send])
    const close = el('button', { class: 'chat__close', type: 'button', 'aria-label': 'Close chat' },
        [el('i', { class: 'ri-close-line', 'aria-hidden': 'true' })])
    const chips = el('div', { class: 'chat__chips' },
        SUGGESTIONS.map(q => el('button', { class: 'chat__chip', type: 'button' }, [q])))

    const panel = el('section', {
        class: 'chat__panel', id: 'chat-panel', role: 'dialog', 'aria-label': "Ask about Hamza's work", hidden: '',
    }, [
        el('header', { class: 'chat__header' }, [el('p', { class: 'chat__title' }, ['Ask about Hamza']), close]),
        log, chips, form,
        el('p', { class: 'chat__note' }, ['AI assistant answering in Hamza’s voice. It can be wrong.']),
    ])

    document.body.append(launcher, panel)
    addMessage('model', GREETING)

    const open = () => {
        panel.hidden = false
        launcher.setAttribute('aria-expanded', 'true')
        input.focus()
    }
    const hide = () => {
        panel.hidden = true
        launcher.setAttribute('aria-expanded', 'false')
        launcher.focus()
    }

    launcher.addEventListener('click', () => (panel.hidden ? open() : hide()))
    close.addEventListener('click', hide)
    panel.addEventListener('keydown', e => { if (e.key === 'Escape') hide() })
    chips.addEventListener('click', e => {
        const chip = e.target.closest('.chat__chip')
        if (chip) ask(chip.textContent)
    })
    input.addEventListener('keydown', e => {
        // Enter sends, Shift+Enter adds a line.
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit() }
    })
    form.addEventListener('submit', e => { e.preventDefault(); ask(input.value) })

    async function ask(raw) {
        const text = raw.trim()
        if (!text || busy) return
        busy = true
        send.disabled = true
        chips.hidden = true
        input.value = ''

        addMessage('user', text)
        history.push({ role: 'user', text })
        const pending = addMessage('model', 'Thinking…', 'chat__msg--pending')

        let reply
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: history.slice(-8) }),
            })
            const data = await res.json().catch(() => ({}))
            reply = res.ok ? data.reply : null
            if (!reply) throw new Error(data.error || 'The assistant is unavailable right now.')
            history.push({ role: 'model', text: reply })
            pending.textContent = reply
            pending.classList.remove('chat__msg--pending')
        } catch (err) {
            // A failed turn is dropped from history so the next question is
            // not sent after an unanswered one.
            history.pop()
            // fetch() itself rejects with a TypeError ("Failed to fetch") when
            // the network or CORS fails; only the Worker's own messages are shown.
            pending.textContent = (!(err instanceof TypeError) && err.message) || 'The assistant is unavailable right now.'
            pending.classList.replace('chat__msg--pending', 'chat__msg--error')
        } finally {
            busy = false
            send.disabled = false
            input.focus()
            log.scrollTop = log.scrollHeight
        }
    }

    // textContent only: model output is never parsed as HTML.
    function addMessage(role, text, extra) {
        const msg = el('p', { class: `chat__msg chat__msg--${role}${extra ? ' ' + extra : ''}` }, [text])
        log.append(msg)
        log.scrollTop = log.scrollHeight
        return msg
    }

    function el(tag, attrs, children = []) {
        const node = document.createElement(tag)
        for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
        for (const c of children) node.append(c)
        return node
    }
})()
