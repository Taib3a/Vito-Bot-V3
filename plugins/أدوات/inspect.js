async function resolverJid(sock, jid) {
    if (!jid) return null
    if (!jid.endsWith('@lid')) {
        return jid.split(':')[0].split('@')[0] + '@s.whatsapp.net'
    }
    try {
        const pn = await sock.signalRepository?.lidMapping?.getPNForLID(jid)
        if (pn) return pn.split(':')[0].split('@')[0] + '@s.whatsapp.net'
    } catch {}
    return jid // no se pudo resolver: se queda como LID (WhatsApp lo muestra con nombre al mencionarlo)
}

export default {
    name: ['inspect', 'inspeccionar', 'فحص-رسالة'],
    description: { es: 'Inspecciona un enlace de grupo, comunidad o canal de WhatsApp', ar: 'يفحص رابط مجموعة أو مجتمع أو قناة واتساب' },
    category: "herramientas, الأدوات",

    async run({ sock, from, msg, text, reply, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

        const sender = msg.key.participant || msg.key.remoteJid

        let fkontak = {
            "key": {
                "participants": "0@s.whatsapp.net",
                "remoteJid": "status@broadcast",
                "fromMe": false,
                "id": "Halo"
            },
            "message": {
                "contactMessage": {
                    "vcard": `BEGIN:VCARD\nVERSION:3.0\nN:Sy;Bot;;;\nFN:y\nitem1.TEL;waid=${sender.split('@')[0]}:${sender.split('@')[0]}\nitem1.X-ABLabel:Ponsel\nEND:VCARD`
                }
            },
            "participant": "0@s.whatsapp.net"
        }

        if (!text) return await reply({ text: tr('```ⓘ Ingrese un enlace de grupo, comunidad o canal.```', '```ⓘ أدخل رابط مجموعة أو مجتمع أو قناة.```') })

        const groupUrl = text.match(/(?:https?:\/\/)?(?:chat\.whatsapp\.com\/)([0-9A-Za-z]{22,24})/i)?.[1]
        const channelUrl = text.match(/(?:https?:\/\/)?(?:whatsapp\.com\/channel\/)([0-9A-Za-z@.]+)/i)?.[1]

        let caption = ''
        let mentions = []

        // ─── CANAL ───
        if (channelUrl) {
            try {
                const info = await sock.newsletterMetadata("invite", channelUrl).catch(() => null)

                if (!info) {
                    return await reply({ text: tr(`❌ No se encontró información del canal. Verifique que el enlace sea correcto.`, `❌ لم تُعثر على معلومات القناة. تحقق من صحة الرابط.`) })
                }

                const meta = info.thread_metadata || {}

                const id = info.id || tr('No encontrado', 'غير موجود')
                const nombre = meta.name?.text || tr('Sin nombre', 'بدون اسم')
                const descripcion = meta.description?.text || tr('Sin descripción', 'بدون وصف')
                const suscriptores = meta.subscribers_count ?? tr('No disponible', 'غير متاح')
                const verificado = meta.verification === 'VERIFIED' ? tr('✅ Verificado', '✅ موثّق') : tr('❌ No verificado', '❌ غير موثّق')

                caption =
tr(`📢 *INFORMACIÓN DEL CANAL*`, `📢 *معلومات القناة*`) + `

` + tr(`🪪 *Nombre:* ${nombre}`, `🪪 *الاسم:* ${nombre}`) + `
` + tr(`🆔 *ID:* ${id}`, `🆔 *المعرّف:* ${id}`) + `
` + tr(`👥 *Suscriptores:* ${suscriptores}`, `👥 *المشتركون:* ${suscriptores}`) + `
${verificado}
` + tr(`📝 *Descripción:* ${descripcion}`, `📝 *الوصف:* ${descripcion}`)

            } catch (e) {
                console.error(tr('Error canal:', 'خطأ في القناة:'), e)
                return await reply({ text: tr(`❌ Error al obtener información del canal.`, `❌ خطأ في جلب معلومات القناة.`) })
            }

        // ─── GRUPO / COMUNIDAD ───
        } else if (groupUrl) {
            try {
                const info = await sock.groupGetInviteInfo(groupUrl).catch(() => null)

                if (!info) {
                    return await reply({ text: tr(`❌ No se encontró información. Verifique que el enlace sea válido.`, `❌ لم تُعثر على معلومات. تحقق من صحة الرابط.`) })
                }

                const id = info.id || tr('No encontrado', 'غير موجود')
                const nombre = info.subject || tr('Sin nombre', 'بدون اسم')
                const descripcion = info.desc || tr('Sin descripción', 'بدون وصف')
                const participantes = info.size ?? info.participants?.length ?? tr('No disponible', 'غير متاح')
                const esComunidad = !!info.isCommunity

                // Creador (arreglo LID): prioriza ownerPn, si no, resuelve el LID
                const creadorJid = await resolverJid(sock, info.ownerPn || info.owner)
                let creador = tr('No disponible / Salió del grupo', 'غير متاح / غادر المجموعة')
                if (creadorJid) {
                    creador = `@${creadorJid.split('@')[0]}`
                    mentions.push(creadorJid)
                }

                const creacion = info.creation
                    ? new Date(info.creation * 1000).toLocaleDateString('es-ES')
                    : tr('No disponible', 'غير متاح')

                caption =
tr(esComunidad ? '🏘️ *INFORMACIÓN DE LA COMUNIDAD*' : '👥 *INFORMACIÓN DEL GRUPO*', esComunidad ? '🏘️ *معلومات المجتمع*' : '👥 *معلومات المجموعة*') + `

` + tr(`📛 *Nombre:* ${nombre}`, `📛 *الاسم:* ${nombre}`) + `
` + tr(`🆔 *ID:* ${id}`, `🆔 *المعرّف:* ${id}`) + `
` + tr(`👑 *Creador:* ${creador}`, `👑 *المُنشئ:* ${creador}`) + `
` + tr(`👥 *Participantes:* ${participantes}`, `👥 *المشاركون:* ${participantes}`) + `
` + tr(`📅 *Creado:* ${creacion}`, `📅 *تاريخ الإنشاء:* ${creacion}`) + `
` + tr(`📝 *Descripción:* ${descripcion}`, `📝 *الوصف:* ${descripcion}`)

            } catch (e) {
                console.error(tr('Error grupo/comunidad:', 'خطأ في المجموعة/المجتمع:'), e)
                return await reply({ text: tr(`❌ Error al obtener información del grupo o comunidad.`, `❌ خطأ في جلب معلومات المجموعة أو المجتمع.`) })
            }

        } else {
            return await reply({ text: tr(`❌ No se detectó un enlace válido de grupo, comunidad o canal de WhatsApp.`, `❌ لم يُكتشف رابط صالح لمجموعة أو مجتمع أو قناة واتساب.`) })
        }

        await sock.sendMessage(from, {
            text: caption,
            contextInfo: { mentionedJid: mentions }
        }, { quoted: fkontak })
    }
}