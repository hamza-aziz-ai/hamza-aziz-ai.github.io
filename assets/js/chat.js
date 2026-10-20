/*=============== CHAT ASSISTANT ===============*/
// "Ask about Hamza" chat. Talks to the Cloudflare Worker in worker/, which
// holds the model key; nothing secret lives here.
//
// The Worker URL comes from this script tag's data-endpoint. While it is
// empty the widget renders nothing, so this file can ship before the
// Worker is deployed. data-mode="page" (chat.html) renders the chat as the
// whole page instead of a floating panel.
(function () {
    const script = document.currentScript
    const endpoint = script && script.dataset.endpoint
    if (!endpoint) return
    const pageMode = script.dataset.mode === 'page'

    const SUGGESTIONS = [
        "What's something not on Hamza's resume?",
        'What was the hardest problem he solved?',
        'Is he open to roles in the UAE?',
    ]
    // Greeting is UI-only and never sent upstream: the conversation sent to
    // the model must start with a visitor message.
    const GREETING = "Hi, I'm Hamza's AI assistant. I answer on his behalf, from his portfolio and his own engineering notes. Ask about his projects, decisions or experience."
    // Carries the conversation into the full-page view; read once, then removed.
    const HANDOFF = 'chat-handoff'

    const history = []
    let busy = false
    // Touch screens: focusing the field pops the on-screen keyboard over the
    // answer, so it opens only when the visitor taps the field themselves.
    const touch = matchMedia('(pointer: coarse)').matches
    const focusInput = () => { if (!touch) input.focus() }

    const launcher = el('button', {
        class: 'chat__launcher', type: 'button',
        'aria-label': 'Ask about Hamza', 'aria-expanded': 'false', 'aria-controls': 'chat-panel',
    }, [icon('ri-chat-3-line')])

    const log = el('div', { class: 'chat__log', 'aria-live': 'polite' })
    const input = el('textarea', {
        class: 'chat__input', rows: '1', maxlength: '800',
        placeholder: 'Ask about his projects, decisions…', 'aria-label': 'Your question',
    })
    const send = el('button', { class: 'chat__send', type: 'submit', 'aria-label': 'Send' }, [icon('ri-send-plane-2-line')])
    const form = el('form', { class: 'chat__form' }, [input, send])
    const expand = el('button', { class: 'chat__action', type: 'button', 'aria-label': 'Open chat in a new tab', title: 'Open in a new tab' },
        [icon('ri-external-link-line')])
    const close = el('button', { class: 'chat__action', type: 'button', 'aria-label': 'Close chat', title: 'Close' }, [icon('ri-close-line')])
    const home = el('a', { class: 'chat__action', href: '/', 'aria-label': 'Back to hamzaaziz.dev', title: 'Back to hamzaaziz.dev' },
        [icon('ri-home-4-line')])
    const chips = el('div', { class: 'chat__chips' },
        SUGGESTIONS.map(q => el('button', { class: 'chat__chip', type: 'button' }, [q])))

    const panel = el('section', {
        class: pageMode ? 'chat__panel chat__panel--page' : 'chat__panel',
        id: 'chat-panel', 'aria-label': "Ask about Hamza's work",
        ...(pageMode ? {} : { role: 'dialog', hidden: '' }),
    }, [
        el('header', { class: 'chat__header' }, [
            el('p', { class: 'chat__title' }, ['Ask about Hamza']),
            el('div', { class: 'chat__actions' }, pageMode ? [home] : [expand, close]),
        ]),
        log, chips, form,
        el('p', { class: 'chat__note' }, ['AI assistant answering on Hamza’s behalf. It can be wrong.']),
    ])

    addMessage('model', GREETING)
    if (pageMode) {
        document.body.append(panel)
        restore()
        focusInput()
    } else {
        document.body.append(launcher, panel)
    }

    const open = () => {
        panel.hidden = false
        launcher.setAttribute('aria-expanded', 'true')
        focusInput()
    }
    const hide = () => {
        panel.hidden = true
        launcher.setAttribute('aria-expanded', 'false')
        launcher.focus()
    }

    launcher.addEventListener('click', () => (panel.hidden ? open() : hide()))
    close.addEventListener('click', hide)
    expand.addEventListener('click', () => {
        try { localStorage.setItem(HANDOFF, JSON.stringify(history)) } catch { /* opens empty */ }
        window.open('/chat.html', '_blank', 'noopener')
    })
    if (!pageMode) panel.addEventListener('keydown', e => { if (e.key === 'Escape') hide() })
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
        if (touch) input.blur()  // drop the keyboard so the answer is readable

        addMessage('user', text)
        history.push({ role: 'user', text })
        const pending = addMessage('model', 'Thinking…', 'chat__msg--pending')

        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: history.slice(-8) }),
            })
            const data = await res.json().catch(() => ({}))
            const reply = res.ok ? data.reply : null
            if (!reply) throw new Error(data.error || 'The assistant is unavailable right now.')
            history.push({ role: 'model', text: reply })
            pending.replaceChildren(renderMarkdown(reply))
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
            focusInput()
            log.scrollTop = log.scrollHeight
        }
    }

    // Replays the conversation handed over by the floating panel.
    function restore() {
        let saved = []
        try {
            saved = JSON.parse(localStorage.getItem(HANDOFF) || '[]')
            localStorage.removeItem(HANDOFF)
        } catch { /* storage blocked or corrupt: start fresh */ }
        if (!Array.isArray(saved)) return
        for (const m of saved) {
            if (!m || (m.role !== 'user' && m.role !== 'model') || typeof m.text !== 'string') continue
            history.push({ role: m.role, text: m.text })
            addMessage(m.role, m.text)
        }
        if (history.length) chips.hidden = true
    }

    // Model replies are rendered as Markdown; visitor text stays plain.
    function addMessage(role, text, extra) {
        const msg = el('div', { class: `chat__msg chat__msg--${role}${extra ? ' ' + extra : ''}` },
            role === 'model' && !extra ? [renderMarkdown(text)] : [text])
        log.append(msg)
        log.scrollTop = log.scrollHeight
        return msg
    }

    // Minimal Markdown built as DOM nodes: nothing the model writes is ever
    // parsed as HTML. Covers what the model emits: paragraphs, "-" and "1."
    // lists, headings, **bold**, *italic*, `code`, [links](url), bare URLs and
    // email addresses.
    function renderMarkdown(text) {
        const frag = document.createDocumentFragment()
        let list = null
        let para = null
        for (const raw of String(text).replace(/\r/g, '').split('\n')) {
            const line = raw.trim()
            if (!line) { list = para = null; continue }
            const item = line.match(/^(?:[-*•]|(\d+)[.)])\s+(.*)$/)
            if (item) {
                const tag = item[1] ? 'ol' : 'ul'
                if (!list || list.localName !== tag) { list = el(tag, {}); frag.append(list) }
                list.append(el('li', {}, inline(item[2])))
                para = null
                continue
            }
            list = null
            const heading = line.match(/^#{1,6}\s+(.*)$/)
            const content = heading ? [el('strong', {}, inline(heading[1]))] : inline(line)
            if (para) para.append(el('br', {}))
            else { para = el('p', {}); frag.append(para) }
            para.append(...content)
        }
        return frag
    }

    function inline(text) {
        const INLINE = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"])|([\w.+-]+@[\w-]+(?:\.[\w-]+)+)|(?<![\w*])\*(?!\s)([^*]+?)\*(?![\w*])|(?<!\w)_(?!\s)([^_]+?)_(?!\w)/g
        const out = []
        let last = 0
        for (const m of text.matchAll(INLINE)) {
            const [all, bold, code, label, href, url, email, em1, em2] = m
            if (m.index > last) out.push(text.slice(last, m.index))
            if (bold) out.push(el('strong', {}, inline(bold)))
            else if (code) out.push(el('code', {}, [code]))
            else if (label) out.push(link(href, inline(label)) || all)
            else if (url) out.push(link(url, [url]) || url)
            else if (email) out.push(link('mailto:' + email, [email]) || email)
            else out.push(el('em', {}, inline(em1 || em2)))
            last = m.index + all.length
        }
        if (last < text.length) out.push(text.slice(last))
        return out
    }

    // Only web and mail links; anything else (javascript:, data:) stays text.
    function link(href, children) {
        let url
        try { url = new URL(href, location.href) } catch { return null }
        if (!['https:', 'http:', 'mailto:'].includes(url.protocol)) return null
        const a = el('a', { class: 'chat__link', href: url.href }, children)
        if (url.protocol !== 'mailto:') { a.target = '_blank'; a.rel = 'noopener noreferrer' }
        return a
    }

    function icon(name) {
        return el('i', { class: name, 'aria-hidden': 'true' })
    }

    function el(tag, attrs, children = []) {
        const node = document.createElement(tag)
        for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
        for (const c of children) node.append(c)
        return node
    }
})()
