import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ChannelSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    ComponentType,
    ChannelType,
    EmbedBuilder,
    LabelBuilder,
    RadioGroupBuilder,
} from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { getColor } from '../../config/bot.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_FIELDS = 25;
const IDLE_TIMEOUT = 900_000; // 15 minutes

const COLOR_PRESETS = [
    { label: 'Primaire (Bleu)',        value: '#336699', emoji: '🔵' },
    { label: 'Succès (Vert)',          value: '#57F287', emoji: '🟢' },
    { label: 'Erreur (Rouge)',         value: '#ED4245', emoji: '🔴' },
    { label: 'Avertissement (Jaune)',  value: '#FEE75C', emoji: '🟡' },
    { label: 'Info (Bleu vif)',        value: '#3498DB', emoji: '💙' },
    { label: 'Blurple (Discord)',      value: '#5865F2', emoji: '🟣' },
    { label: 'Fuchsia',               value: '#EB459E', emoji: '💜' },
    { label: 'Or',                     value: '#F1C40F', emoji: '🟠' },
    { label: 'Blanc',                  value: '#FFFFFF', emoji: '⚪' },
    { label: 'Sombre',                 value: '#202225', emoji: '⚫' },
    { label: 'Hexadécimal personnalisé...', value: '__custom__', emoji: '🎨' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidUrl(str) {
    try {
        const url = new URL(str);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

function isValidHex(str) {
    return /^#[0-9A-Fa-f]{6}$/.test(str);
}

// ─── Embed Builders ────────────────────────────────────────────────────────────

/**
 * Builds the live preview embed from current state.
 */
function buildPreviewEmbed(state) {
    const embed = new EmbedBuilder();

    if (state.title)       embed.setTitle(state.title.substring(0, 256));
    if (state.description) embed.setDescription(state.description.substring(0, 4096));

    try {
        embed.setColor(state.color || getColor('primary'));
    } catch {
        embed.setColor(getColor('primary'));
    }

    if (state.author?.name) {
        const obj = { name: state.author.name.substring(0, 256) };
        if (state.author.iconUrl && isValidUrl(state.author.iconUrl)) obj.iconURL = state.author.iconUrl;
        if (state.author.url   && isValidUrl(state.author.url))      obj.url     = state.author.url;
        embed.setAuthor(obj);
    }

    if (state.footer?.text) {
        const obj = { text: state.footer.text.substring(0, 2048) };
        if (state.footer.iconUrl && isValidUrl(state.footer.iconUrl)) obj.iconURL = state.footer.iconUrl;
        embed.setFooter(obj);
    }

    if (state.thumbnail && isValidUrl(state.thumbnail)) embed.setThumbnail(state.thumbnail);
    if (state.image     && isValidUrl(state.image))     embed.setImage(state.image);
    if (state.timestamp) embed.setTimestamp();

    if (state.fields.length > 0) embed.addFields(state.fields.slice(0, 25));

    // Ensure the embed renders if completely empty
    if (
        !state.title &&
        !state.description &&
        state.fields.length === 0 &&
        !state.author?.name
    ) {
        embed.setDescription('*(Vide — utilisez le menu ci-dessous pour ajouter du contenu)*');
    }

    return embed;
}

/**
 * Builds the status/control dashboard embed (shown below the preview).
 */
function buildDashboardEmbed(state) {
    const trunc = (str, n) =>
        str.length > n ? str.substring(0, n) + '…' : str;

    const lines = [
        `**Titre** › ${state.title ? `\`${trunc(state.title, 40)}\`` : '`Non défini`'}`,
        `**Description** › ${state.description ? `${state.description.length} caractère(s)` : '`Non défini`'}`,
        `**Couleur** › ${state.color ? `\`${state.color}\`` : '`Par défaut`'}`,
        `**Auteur** › ${state.author?.name ? `\`${trunc(state.author.name, 30)}\`` : '`Non défini`'}`,
        `**Pied de page** › ${state.footer?.text ? `\`${trunc(state.footer.text, 30)}\`` : '`Non défini`'}`,
        `**Miniature** › ${state.thumbnail ? '✅ Défini' : '`Non défini`'}`,
        `**Image** › ${state.image ? '✅ Défini' : '`Non défini`'}`,
        `**Horodatage** › ${state.timestamp ? '✅ Activé' : '`Désactivé`'}`,
        `**Champs** › ${state.fields.length} / ${MAX_FIELDS}`,
    ];

    return new EmbedBuilder()
        .setTitle('🛠️ Constructeur d\'embed — Panneau de contrôle')
        .setDescription(lines.join('\n'))
        .setColor(getColor('info'))
        .setFooter({ text: 'L\'aperçu ci-dessus se met à jour en direct · Se ferme après 5 min d\'inactivité' });
}

/**
 * Builds the main action select menu.
 */
function buildMainMenu(state) {
    const select = new StringSelectMenuBuilder()
        .setCustomId('eb_menu')
        .setPlaceholder('Choisissez une action...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Modifier le contenu')
                .setDescription('Définir le titre et la description')
                .setValue('edit_content')
                .setEmoji('✏️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Définir la couleur')
                .setDescription('Choisir un préréglage ou entrer un code hexadécimal')
                .setValue('set_color')
                .setEmoji('🎨'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Définir l\'auteur')
                .setDescription('Configurer le bloc auteur en haut de l\'embed')
                .setValue('set_author')
                .setEmoji('👤'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Définir le pied de page')
                .setDescription('Configurer le texte et l\'icône du pied de page')
                .setValue('set_footer')
                .setEmoji('📄'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Définir les images')
                .setDescription('Définir la miniature ou l\'image bannière')
                .setValue('set_images')
                .setEmoji('🖼️'),
            new StringSelectMenuOptionBuilder()
                .setLabel(`Ajouter un champ  (${state.fields.length}/${MAX_FIELDS})`)
                .setDescription('Ajouter un nouveau champ en ligne ou en bloc')
                .setValue('add_field')
                .setEmoji('➕'),
        );

    if (state.fields.length > 0) {
        select.addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Modifier un champ')
                .setDescription('Modifier le nom, la valeur ou le paramètre en ligne d\'un champ')
                .setValue('edit_field')
                .setEmoji('📝'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Supprimer un champ')
                .setDescription('Supprimer un champ de l\'embed')
                .setValue('remove_field')
                .setEmoji('➖'),
        );

        if (state.fields.length >= 2) {
            select.addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('Réorganiser les champs')
                    .setDescription('Déplacer un champ vers le haut ou le bas de la liste')
                    .setValue('reorder_fields')
                    .setEmoji('↕️'),
            );
        }
    }

    select.addOptions(
        new StringSelectMenuOptionBuilder()
            .setLabel(state.timestamp ? 'Désactiver l\'horodatage' : 'Activer l\'horodatage')
            .setDescription('Activer/désactiver l\'horodatage automatique dans le pied de page')
            .setValue('toggle_timestamp')
            .setEmoji('🕐'),
        new StringSelectMenuOptionBuilder()
            .setLabel('Publier l\'embed')
            .setDescription('Envoyer l\'embed terminé dans un salon')
            .setValue('post_embed')
            .setEmoji('📤'),
        new StringSelectMenuOptionBuilder()
            .setLabel('JSON / Données brutes')
            .setDescription('Afficher le JSON brut de cet embed')
            .setValue('json_export')
            .setEmoji('📋'),
        new StringSelectMenuOptionBuilder()
            .setLabel('Tout réinitialiser')
            .setDescription('Effacer tous les champs et recommencer')
            .setValue('reset_all')
            .setEmoji('🗑️'),
    );

    return select;
}

/**
 * Updates the dashboard message with the latest state.
 */
async function refreshDashboard(interaction, state) {
    return await InteractionHelper.safeEditReply(interaction, {
        embeds: [buildPreviewEmbed(state), buildDashboardEmbed(state)],
        components: [new ActionRowBuilder().addComponents(buildMainMenu(state))],
    });
}

// ─── Option Handlers ──────────────────────────────────────────────────────────

async function handleEditContent(selectInteraction, rootInteraction, state) {
    const modal = new ModalBuilder()
        .setCustomId('eb_content')
        .setTitle('Modifier le contenu')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('eb_title')
                    .setLabel('Titre (max 256 caractères)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.title || '')
                    .setMaxLength(256)
                    .setRequired(false)
                    .setPlaceholder('Mon titre d\'embed'),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('eb_description')
                    .setLabel('Description (max 4000 caractères)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(state.description ? state.description.substring(0, 4000) : '')
                    .setMaxLength(4000)
                    .setRequired(false)
                    .setPlaceholder('Écrivez la description de votre embed ici...'),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i => i.customId === 'eb_content' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    // Defer immediately to avoid interaction timeout
    await submitted.deferUpdate().catch(() => {});

    state.title       = submitted.fields.getTextInputValue('eb_title').trim()       || null;
    state.description = submitted.fields.getTextInputValue('eb_description').trim() || null;

    await refreshDashboard(rootInteraction, state);
}

async function handleSetColor(selectInteraction, rootInteraction, state) {
    await selectInteraction.deferUpdate().catch(() => {});

    const colorSelect = new StringSelectMenuBuilder()
        .setCustomId('eb_color_pick')
        .setPlaceholder('Choisissez une couleur...')
        .addOptions(
            COLOR_PRESETS.map(c =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(c.label)
                    .setValue(c.value)
                    .setEmoji(c.emoji)
                    .setDescription(c.value !== '__custom__' ? c.value : 'Entrez votre propre valeur #RRGGBB'),
            ),
        );

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('🎨 Définir la couleur')
                .setDescription(
                    'Sélectionnez une couleur préréglée ou choisissez **Hexadécimal personnalisé** pour entrer votre propre valeur `#RRGGBB`.',
                )
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(colorSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const colorCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'eb_color_pick',
        time: 60_000,
        max: 1,
    });

    colorCollector.on('collect', async colorInter => {
        const picked = colorInter.values[0];

        if (picked === '__custom__') {
            const hexModal = new ModalBuilder()
                .setCustomId('eb_custom_hex')
                .setTitle('Couleur personnalisée')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('hex_value')
                            .setLabel('Code couleur hexadécimal')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('#5865F2')
                            .setMaxLength(7)
                            .setMinLength(7)
                            .setRequired(true),
                    ),
                );

            await colorInter.showModal(hexModal);

            const hexSubmit = await colorInter
                .awaitModalSubmit({
                    filter: i =>
                        i.customId === 'eb_custom_hex' && i.user.id === colorInter.user.id,
                    time: 60_000,
                })
                .catch(() => null);

            if (!hexSubmit) return;

            const hex = hexSubmit.fields.getTextInputValue('hex_value').trim();
            if (!isValidHex(hex)) {
                await hexSubmit.reply({
                    embeds: [
                        errorEmbed(
                            'Hexadécimal invalide',
                            `\`${hex}\` n'est pas une couleur hexadécimale valide. Utilisez le format \`#RRGGBB\` (ex. \`#5865F2\`).`,
                        ),
                    ],
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            state.color = hex;
            await hexSubmit.deferUpdate().catch(() => {});
        } else {
            state.color = picked;
            await colorInter.deferUpdate().catch(() => {});
        }

        await refreshDashboard(rootInteraction, state);
    });
}

async function handleSetAuthor(selectInteraction, rootInteraction, state) {
    const modal = new ModalBuilder()
        .setCustomId('eb_author')
        .setTitle('Définir l\'auteur')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('author_name')
                    .setLabel('Nom de l\'auteur (laisser vide pour supprimer)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.author?.name || '')
                    .setMaxLength(256)
                    .setRequired(false)
                    .setPlaceholder('Votre nom'),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('author_icon')
                    .setLabel('URL de l\'icône auteur (optionnel)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.author?.iconUrl || '')
                    .setRequired(false)
                    .setPlaceholder('https://example.com/icon.png'),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('author_url')
                    .setLabel('URL du lien auteur (optionnel)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.author?.url || '')
                    .setRequired(false)
                    .setPlaceholder('https://example.com'),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i => i.customId === 'eb_author' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const name    = submitted.fields.getTextInputValue('author_name').trim();
    const iconUrl = submitted.fields.getTextInputValue('author_icon').trim();
    const url     = submitted.fields.getTextInputValue('author_url').trim();

    if (iconUrl && !isValidUrl(iconUrl)) {
        await submitted.reply({
            embeds: [errorEmbed('URL invalide', 'L\'URL de l\'icône auteur doit être une URL `https://` valide.')],
            flags: MessageFlags.Ephemeral,
        });
        return;
    }
    if (url && !isValidUrl(url)) {
        await submitted.reply({
            embeds: [errorEmbed('URL invalide', 'L\'URL du lien auteur doit être une URL `https://` valide.')],
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    state.author = name ? { name, iconUrl: iconUrl || null, url: url || null } : null;

    await submitted.deferUpdate().catch(() => {});
    await refreshDashboard(rootInteraction, state);
}

async function handleSetFooter(selectInteraction, rootInteraction, state) {
    const modal = new ModalBuilder()
        .setCustomId('eb_footer')
        .setTitle('Définir le pied de page')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('footer_text')
                    .setLabel('Texte du pied de page (vide pour supprimer)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.footer?.text || '')
                    .setMaxLength(2048)
                    .setRequired(false)
                    .setPlaceholder('Créé avec TitanBot'),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('footer_icon')
                    .setLabel('URL de l\'icône du pied de page (optionnel)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.footer?.iconUrl || '')
                    .setRequired(false)
                    .setPlaceholder('https://example.com/icon.png'),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i => i.customId === 'eb_footer' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const text    = submitted.fields.getTextInputValue('footer_text').trim();
    const iconUrl = submitted.fields.getTextInputValue('footer_icon').trim();

    if (iconUrl && !isValidUrl(iconUrl)) {
        await submitted.reply({
            embeds: [errorEmbed('URL invalide', 'L\'URL de l\'icône du pied de page doit être une URL `https://` valide.')],
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    state.footer = text ? { text, iconUrl: iconUrl || null } : null;

    await submitted.deferUpdate().catch(() => {});
    await refreshDashboard(rootInteraction, state);
}

async function handleSetImages(selectInteraction, rootInteraction, state) {
    await selectInteraction.deferUpdate().catch(() => {});

    const imageSelect = new StringSelectMenuBuilder()
        .setCustomId('eb_image_pick')
        .setPlaceholder('Que souhaitez-vous modifier ?')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Définir la miniature')
                .setDescription('Petite image affichée en haut à droite')
                .setValue('set_thumbnail')
                .setEmoji('🖼️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Définir l\'image principale')
                .setDescription('Image bannière pleine largeur en bas')
                .setValue('set_image')
                .setEmoji('📸'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Effacer la miniature')
                .setDescription('Supprimer la miniature actuelle')
                .setValue('clear_thumbnail')
                .setEmoji('🗑️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Effacer l\'image principale')
                .setDescription('Supprimer l\'image principale actuelle')
                .setValue('clear_image')
                .setEmoji('🗑️'),
        );

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('🖼️ Définir les images')
                .setDescription('Choisissez quelle image définir ou supprimer.')
                .addFields(
                    { name: 'Miniature',       value: state.thumbnail ? `[Voir](${state.thumbnail})` : '`Non défini`', inline: true },
                    { name: 'Image principale', value: state.image     ? `[Voir](${state.image})`     : '`Non défini`', inline: true },
                )
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(imageSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const imgMenuCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'eb_image_pick',
        time: 60_000,
        max: 1,
    });

    imgMenuCollector.on('collect', async imgInter => {
        const pick = imgInter.values[0];

        if (pick === 'clear_thumbnail') {
            state.thumbnail = null;
            await imgInter.deferUpdate();
            await refreshDashboard(rootInteraction, state);
            return;
        }
        if (pick === 'clear_image') {
            state.image = null;
            await imgInter.deferUpdate();
            await refreshDashboard(rootInteraction, state);
            return;
        }

        const isThumb = pick === 'set_thumbnail';

        const urlModal = new ModalBuilder()
            .setCustomId('eb_image_url')
            .setTitle(isThumb ? 'Définir la miniature' : 'Définir l\'image principale')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('image_url')
                        .setLabel('URL de l\'image')
                        .setStyle(TextInputStyle.Short)
                        .setValue(isThumb ? (state.thumbnail || '') : (state.image || ''))
                        .setRequired(true)
                        .setPlaceholder('https://example.com/image.png'),
                ),
            );

        await imgInter.showModal(urlModal);

        const submitted = await imgInter
            .awaitModalSubmit({
                filter: i =>
                    i.customId === 'eb_image_url' && i.user.id === imgInter.user.id,
                time: 60_000,
            })
            .catch(() => null);

        if (!submitted) return;

        const url = submitted.fields.getTextInputValue('image_url').trim();
        if (!isValidUrl(url)) {
            await submitted.reply({
                embeds: [
                    errorEmbed('URL invalide', 'L\'URL de l\'image doit être un lien `https://` valide vers une image accessible publiquement.'),
                ],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        if (isThumb) state.thumbnail = url;
        else         state.image     = url;

        await submitted.deferUpdate().catch(() => {});
        await refreshDashboard(rootInteraction, state);
    });
}

async function handleAddField(selectInteraction, rootInteraction, state) {
    if (state.fields.length >= MAX_FIELDS) {
        await selectInteraction.deferUpdate();
        await selectInteraction.followUp({
            embeds: [errorEmbed('Champs pleins', `Les embeds peuvent avoir au maximum ${MAX_FIELDS} champs.`)],
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId('eb_add_field')
        .setTitle('Ajouter un champ');

    const fieldNameLabel = new LabelBuilder()
        .setLabel('Nom du champ (max 256 caractères)')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('field_name')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(256)
                .setRequired(true)
                .setPlaceholder('Titre du champ'),
        );

    const fieldValueLabel = new LabelBuilder()
        .setLabel('Valeur du champ (max 1024 caractères)')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('field_value')
                .setStyle(TextInputStyle.Paragraph)
                .setMaxLength(1024)
                .setRequired(true)
                .setPlaceholder('Le contenu du champ va ici...'),
        );

    const inlineRadio = new RadioGroupBuilder()
        .setCustomId('field_inline')
        .setRequired(false)
        .addOptions([
            { label: 'Non — pleine largeur', value: 'no' },
            { label: 'Oui — côte à côte', value: 'yes' },
        ]);

    const inlineLabel = new LabelBuilder()
        .setLabel('Afficher en ligne ?')
        .setRadioGroupComponent(inlineRadio);

    modal.addLabelComponents(fieldNameLabel, fieldValueLabel, inlineLabel);

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i => i.customId === 'eb_add_field' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const name     = submitted.fields.getTextInputValue('field_name').trim();
    const value    = submitted.fields.getTextInputValue('field_value').trim();
    const inline   = submitted.fields.getRadioGroup('field_inline') === 'yes';

    state.fields.push({ name, value, inline });

    await submitted.deferUpdate().catch(() => {});
    await refreshDashboard(rootInteraction, state);
}

async function handleEditField(selectInteraction, rootInteraction, state) {
    await selectInteraction.deferUpdate();

    const pickSelect = new StringSelectMenuBuilder()
        .setCustomId('eb_edit_field_pick')
        .setPlaceholder('Sélectionnez un champ à modifier...')
        .addOptions(
            state.fields.slice(0, 25).map((f, i) =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(`${i + 1}. ${f.name.substring(0, 50)}`)
                    .setDescription(
                        `${f.value.substring(0, 80)}${f.value.length > 80 ? '…' : ''} · ${f.inline ? 'Inline' : 'Bloc'}`,
                    )
                    .setValue(String(i))
                    .setEmoji('📝'),
            ),
        );

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('📝 Modifier un champ')
                .setDescription('Sélectionnez le champ que vous souhaitez modifier.')
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(pickSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const pickCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'eb_edit_field_pick',
        time: 60_000,
        max: 1,
    });

    pickCollector.on('collect', async pickInter => {
        const idx   = parseInt(pickInter.values[0], 10);
        const field = state.fields[idx];
        if (!field) { await pickInter.deferUpdate(); return; }

        const modal = new ModalBuilder()
            .setCustomId('eb_edit_field_modal')
            .setTitle(`Modifier le champ ${idx + 1}`);

        const editNameLabel = new LabelBuilder()
            .setLabel('Nom du champ')
            .setTextInputComponent(
                new TextInputBuilder()
                    .setCustomId('field_name')
                    .setStyle(TextInputStyle.Short)
                    .setValue(field.name)
                    .setMaxLength(256)
                    .setRequired(true),
            );

        const editValueLabel = new LabelBuilder()
            .setLabel('Valeur du champ')
            .setTextInputComponent(
                new TextInputBuilder()
                    .setCustomId('field_value')
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(field.value.substring(0, 4000))
                    .setMaxLength(1024)
                    .setRequired(true),
            );

        const editInlineRadio = new RadioGroupBuilder()
            .setCustomId('field_inline')
            .setRequired(false)
            .addOptions([
                { label: 'Non — pleine largeur', value: 'no' },
                { label: 'Oui — côte à côte', value: 'yes' },
            ]);
        // Pre-select the current value
        if (field.inline) {
            editInlineRadio.setOptions([
                { label: 'Non — pleine largeur', value: 'no' },
                { label: 'Oui — côte à côte', value: 'yes', default: true },
            ]);
        }

        const editInlineLabel = new LabelBuilder()
            .setLabel('Afficher en ligne ?')
            .setRadioGroupComponent(editInlineRadio);

        modal.addLabelComponents(editNameLabel, editValueLabel, editInlineLabel);

        await pickInter.showModal(modal);

        const submitted = await pickInter
            .awaitModalSubmit({
                filter: i =>
                    i.customId === 'eb_edit_field_modal' && i.user.id === pickInter.user.id,
                time: 120_000,
            })
            .catch(() => null);

        if (!submitted) return;

        const name   = submitted.fields.getTextInputValue('field_name').trim();
        const value  = submitted.fields.getTextInputValue('field_value').trim();
        const inline = submitted.fields.getRadioGroup('field_inline') === 'yes';

        state.fields[idx] = { name, value, inline };

        await submitted.deferUpdate().catch(() => {});
        await refreshDashboard(rootInteraction, state);
    });
}

async function handleRemoveField(selectInteraction, rootInteraction, state) {
    await selectInteraction.deferUpdate();

    const pickSelect = new StringSelectMenuBuilder()
        .setCustomId('eb_remove_field_pick')
        .setPlaceholder('Sélectionnez un champ à supprimer...')
        .addOptions(
            state.fields.slice(0, 25).map((f, i) =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(`${i + 1}. ${f.name.substring(0, 50)}`)
                    .setDescription(
                        `${f.value.substring(0, 90)}${f.value.length > 90 ? '…' : ''}`,
                    )
                    .setValue(String(i))
                    .setEmoji('➖'),
            ),
        );

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('➖ Supprimer un champ')
                .setDescription('Sélectionnez le champ que vous souhaitez supprimer.')
                .setColor(getColor('warning')),
        ],
        components: [new ActionRowBuilder().addComponents(pickSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const removeCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'eb_remove_field_pick',
        time: 60_000,
        max: 1,
    });

    removeCollector.on('collect', async removeInter => {
        await removeInter.deferUpdate();
        const idx = parseInt(removeInter.values[0], 10);
        state.fields.splice(idx, 1);
        await refreshDashboard(rootInteraction, state);
    });
}

async function handleReorderFields(selectInteraction, rootInteraction, state) {
    await selectInteraction.deferUpdate();

    const pickSelect = new StringSelectMenuBuilder()
        .setCustomId('eb_reorder_pick')
        .setPlaceholder('Sélectionnez un champ à déplacer...')
        .addOptions(
            state.fields.slice(0, 25).map((f, i) =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(`${i + 1}. ${f.name.substring(0, 50)}`)
                    .setDescription(
                        `${f.value.substring(0, 90)}${f.value.length > 90 ? '…' : ''}`,
                    )
                    .setValue(String(i))
                    .setEmoji('↕️'),
            ),
        );

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('↕️ Réorganiser les champs')
                .setDescription('Sélectionnez un champ, puis utilisez les flèches pour le déplacer vers le haut ou le bas.')
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(pickSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const pickCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'eb_reorder_pick',
        time: 60_000,
        max: 1,
    });

    pickCollector.on('collect', async pickInter => {
        await pickInter.deferUpdate();
        const sourceIdx = parseInt(pickInter.values[0], 10);

        const upBtn = new ButtonBuilder()
            .setCustomId('eb_reorder_up')
            .setLabel('Déplacer vers le haut')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('⬆️')
            .setDisabled(sourceIdx === 0);

        const downBtn = new ButtonBuilder()
            .setCustomId('eb_reorder_down')
            .setLabel('Déplacer vers le bas')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('⬇️')
            .setDisabled(sourceIdx === state.fields.length - 1);

        const cancelBtn = new ButtonBuilder()
            .setCustomId('eb_reorder_cancel')
            .setLabel('Annuler')
            .setStyle(ButtonStyle.Secondary);

        await pickInter.followUp({
            embeds: [
                new EmbedBuilder()
                    .setTitle('↕️ Déplacer le champ')
                    .setDescription(
                        `Déplacement de **${state.fields[sourceIdx].name}** — actuellement à la position **${sourceIdx + 1}** sur **${state.fields.length}**.`,
                    )
                    .setColor(getColor('info')),
            ],
            components: [new ActionRowBuilder().addComponents(upBtn, downBtn, cancelBtn)],
            flags: MessageFlags.Ephemeral,
        });

        const dirCollector = rootInteraction.channel.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: i =>
                i.user.id === selectInteraction.user.id &&
                ['eb_reorder_up', 'eb_reorder_down', 'eb_reorder_cancel'].includes(i.customId),
            time: 30_000,
            max: 1,
        });

        dirCollector.on('collect', async dirInter => {
            await dirInter.deferUpdate();
            if (dirInter.customId === 'eb_reorder_cancel') return;

            const targetIdx =
                dirInter.customId === 'eb_reorder_up' ? sourceIdx - 1 : sourceIdx + 1;

            if (targetIdx < 0 || targetIdx >= state.fields.length) return;

            const temp             = state.fields[sourceIdx];
            state.fields[sourceIdx] = state.fields[targetIdx];
            state.fields[targetIdx] = temp;

            await refreshDashboard(rootInteraction, state);
        });
    });
}

async function handlePostEmbed(selectInteraction, rootInteraction, state, guild) {
    if (
        !state.title &&
        !state.description &&
        state.fields.length === 0 &&
        !state.author?.name
    ) {
        await selectInteraction.deferUpdate();
        await selectInteraction.followUp({
            embeds: [
                errorEmbed(
                    'Embed vide',
                    'Ajoutez au moins un titre, une description ou un champ avant de publier.',
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    await selectInteraction.deferUpdate();

    const chanSelect = new ChannelSelectMenuBuilder()
        .setCustomId('eb_post_channel')
        .setPlaceholder('Sélectionnez un salon...')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('📤 Publier l\'embed')
                .setDescription('Sélectionnez le salon où cet embed sera envoyé.')
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(chanSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const chanCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.ChannelSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'eb_post_channel',
        time: 60_000,
        max: 1,
    });

    chanCollector.on('collect', async chanInter => {
        await chanInter.deferUpdate();
        const channel = chanInter.channels.first();

        if (!channel) {
            await chanInter.followUp({
                embeds: [errorEmbed('Salon introuvable', 'Impossible de résoudre le salon sélectionné.')],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const perms = channel.permissionsFor(guild.members.me);
        if (!perms?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
            await chanInter.followUp({
                embeds: [
                    errorEmbed(
                        'Permissions manquantes',
                        `J'ai besoin des permissions **Envoyer des messages** et **Intégrer des liens** dans ${channel} pour y publier.`,
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const finalEmbed = buildPreviewEmbed(state);

        // Remove the placeholder description before sending
        if (finalEmbed.data.description === '*(Vide — utilisez le menu ci-dessous pour ajouter du contenu)*') {
            finalEmbed.setDescription(null);
        }

        await channel.send({ embeds: [finalEmbed] });

        await chanInter.followUp({
            embeds: [successEmbed('✅ Embed envoyé', `Votre embed a été publié dans ${channel}.`)],
            flags: MessageFlags.Ephemeral,
        });
    });
}

async function handleJsonExport(selectInteraction, rootInteraction, state) {
    await selectInteraction.deferUpdate();

    const previewEmbed = buildPreviewEmbed(state);
    const json = JSON.stringify(previewEmbed.toJSON(), null, 2);

    if (json.length <= 3980) {
        await selectInteraction.followUp({
            embeds: [
                new EmbedBuilder()
                    .setTitle('📋 JSON de l\'embed')
                    .setDescription(`\`\`\`json\n${json}\n\`\`\``)
                    .setColor(getColor('info')),
            ],
            flags: MessageFlags.Ephemeral,
        });
    } else {
        await selectInteraction.followUp({
            embeds: [
                new EmbedBuilder()
                    .setTitle('📋 JSON de l\'embed')
                    .setDescription('Le JSON est trop long pour être affiché en ligne — voir le fichier joint.')
                    .setColor(getColor('info')),
            ],
            files: [
                {
                    attachment: Buffer.from(json, 'utf-8'),
                    name: 'embed.json',
                },
            ],
            flags: MessageFlags.Ephemeral,
        });
    }
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export default {
    data: new SlashCommandBuilder()
        .setName('embedbuilder')
        .setDescription('Créer et publier un embed entièrement personnalisé avec aperçu en direct')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async execute(interaction) {
        try {
            const deferSuccess = await InteractionHelper.safeDefer(interaction, {
                flags: MessageFlags.Ephemeral,
            });
            if (!deferSuccess) return;

            const guild = interaction.guild;

            // Builder state — holds every embed property being constructed
            const state = {
                title:       null,
                description: null,
                color:       getColor('primary'),
                author:      null,
                footer:      null,
                thumbnail:   null,
                image:       null,
                timestamp:   false,
                fields:      [],
            };

            await refreshDashboard(interaction, state);

            const collector = interaction.channel.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                filter: i =>
                    i.user.id === interaction.user.id && i.customId === 'eb_menu',
                time: IDLE_TIMEOUT,
            });

            collector.on('collect', async ci => {
                try {
                    switch (ci.values[0]) {
                        case 'edit_content':
                            await handleEditContent(ci, interaction, state);
                            break;
                        case 'set_color':
                            await handleSetColor(ci, interaction, state);
                            break;
                        case 'set_author':
                            await handleSetAuthor(ci, interaction, state);
                            break;
                        case 'set_footer':
                            await handleSetFooter(ci, interaction, state);
                            break;
                        case 'set_images':
                            await handleSetImages(ci, interaction, state);
                            break;
                        case 'add_field':
                            await handleAddField(ci, interaction, state);
                            break;
                        case 'edit_field':
                            await handleEditField(ci, interaction, state);
                            break;
                        case 'remove_field':
                            await handleRemoveField(ci, interaction, state);
                            break;
                        case 'reorder_fields':
                            await handleReorderFields(ci, interaction, state);
                            break;
                        case 'toggle_timestamp':
                            state.timestamp = !state.timestamp;
                            await ci.deferUpdate();
                            await refreshDashboard(interaction, state);
                            break;
                        case 'post_embed':
                            await handlePostEmbed(ci, interaction, state, guild);
                            break;
                        case 'json_export':
                            await handleJsonExport(ci, interaction, state);
                            break;
                        case 'reset_all':
                            state.title       = null;
                            state.description = null;
                            state.color       = getColor('primary');
                            state.author      = null;
                            state.footer      = null;
                            state.thumbnail   = null;
                            state.image       = null;
                            state.timestamp   = false;
                            state.fields      = [];
                            await ci.deferUpdate();
                            await refreshDashboard(interaction, state);
                            break;
                        default:
                            await ci.deferUpdate();
                    }
                } catch (error) {
                    logger.error('Error in embedbuilder collector:', error);
                    const msg =
                        error instanceof TitanBotError
                            ? error.userMessage || 'Une erreur s\'est produite.'
                            : 'Une erreur inattendue s\'est produite.';
                    if (!ci.replied && !ci.deferred) await ci.deferUpdate().catch(() => {});
                    await ci
                        .followUp({
                            embeds: [errorEmbed('Erreur', msg)],
                            flags: MessageFlags.Ephemeral,
                        })
                        .catch(() => {});
                }
            });

            collector.on('end', async (_, reason) => {
                if (reason === 'time') {
                    await InteractionHelper.safeEditReply(interaction, { components: [] }).catch(() => {});
                }
            });
        } catch (error) {
            if (error instanceof TitanBotError) throw error;
            logger.error('Unexpected error in embedbuilder:', error);
            throw new TitanBotError(
                `embedbuilder failed: ${error.message}`,
                ErrorTypes.UNKNOWN,
                'Impossible d\'ouvrir le constructeur d\'embed.',
            );
        }
    },
};
