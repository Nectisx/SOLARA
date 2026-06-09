import {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from "discord.js";
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from "../../utils/embeds.js";
import {
    createSelectMenu,
} from "../../utils/components.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATEGORY_SELECT_ID = "help-category-select";
const ALL_COMMANDS_ID = "help-all-commands";
const BUG_REPORT_BUTTON_ID = "help-bug-report";
const HELP_MENU_TIMEOUT_MS = 5 * 60 * 1000;

const CATEGORY_ICONS = {
    Core: "ℹ️",
    Moderation: "🛡️",
    Economy: "💰",
    Fun: "🎮",
    Leveling: "📊",
    Utility: "🔧",
    Ticket: "🎫",
    Welcome: "👋",
    Giveaway: "🎉",
    Counter: "🔢",
    Tools: "🛠️",
    Search: "🔍",
    Reaction_Roles: "🎭",
    Community: "👥",
    Birthday: "🎂",
    Config: "⚙️",
};





export async function createInitialHelpMenu(client) {
    const commandsPath = path.join(__dirname, "../../commands");
    const categoryDirs = (
        await fs.readdir(commandsPath, { withFileTypes: true })
    )
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)
        .sort();

    const options = [
        {
            label: "📋 Toutes les commandes",
            description: "Voir toutes les commandes disponibles avec pagination",
            value: ALL_COMMANDS_ID,
        },
        ...categoryDirs.map((category) => {
            const categoryName =
                category.charAt(0).toUpperCase() +
                category.slice(1).toLowerCase();
            const icon = CATEGORY_ICONS[categoryName] || "🔍";
            return {
                label: `${icon} ${categoryName}`,
                description: `Voir les commandes de la catégorie ${categoryName}`,
                value: category,
            };
        }),
    ];

    const botName = client?.user?.username || "Bot";
    const embed = createEmbed({
        title: `🤖 Centre d'aide ${botName}`,
        description: "Votre compagnon Discord tout-en-un pour la modération, l'économie, les divertissements et la gestion de serveur.",
        color: 'primary'
    });

    embed.addFields(
        {
            name: "🛡️ **Modération**",
            value: "Modération du serveur, gestion des utilisateurs et outils d'application",
            inline: true
        },
        {
            name: "💰 **Économie**",
            value: "Système de monnaie, boutiques et économie virtuelle",
            inline: true
        },
        {
            name: "🎮 **Divertissement**",
            value: "Jeux, divertissements et commandes interactives",
            inline: true
        },
        {
            name: "📊 **Niveaux**",
            value: "Niveaux d'utilisateur, système XP et suivi de progression",
            inline: true
        },
        {
            name: "🎫 **Tickets**",
            value: "Système de tickets de support pour la gestion du serveur",
            inline: true
        },
        {
            name: "🎉 **Concours**",
            value: "Gestion automatisée des concours et distribution des prix",
            inline: true
        },
        {
            name: "👋 **Bienvenue**",
            value: "Messages de bienvenue et intégration des membres",
            inline: true
        },
        {
            name: "🎂 **Anniversaires**",
            value: "Suivi des anniversaires et fonctionnalités de célébration",
            inline: true
        },
        {
            name: "👥 **Communauté**",
            value: "Outils communautaires, candidatures et engagement des membres",
            inline: true
        },
        {
            name: "⚙️ **Configuration**",
            value: "Commandes de gestion de la configuration du serveur et du bot",
            inline: true
        },
        {
            name: "🔢 **Compteur**",
            value: "Configuration du compteur en direct et contrôles du compteur",
            inline: true
        },
        {
            name: "🎙️ **Rejoindre pour créer**",
            value: "Création et gestion dynamique de salons vocaux",
            inline: true
        },
        {
            name: "🎭 **Rôles par réaction**",
            value: "Rôles auto-attribuables via des systèmes de réaction",
            inline: true
        },
        {
            name: "✅ **Vérification**",
            value: "Processus de vérification des membres et contrôle d'accès",
            inline: true
        },
        {
            name: "🔧 **Utilitaires**",
            value: "Outils pratiques et utilitaires pour le serveur",
            inline: true
        }
    );

    embed.setFooter({
        text: "Fait avec ❤️"
    });
    embed.setTimestamp();

    const bugReportButton = new ButtonBuilder()
        .setCustomId(BUG_REPORT_BUTTON_ID)
        .setLabel("Signaler un bug")
        .setStyle(ButtonStyle.Danger);

    const supportButton = new ButtonBuilder()
        .setLabel("Serveur de support")
        .setURL("https://discord.gg/QnWNz2dKCE")
        .setStyle(ButtonStyle.Link);

    const touchpointButton = new ButtonBuilder()
        .setLabel("Apprendre avec Touchpoint")
        .setURL("https://www.youtube.com/@TouchDisc")
        .setStyle(ButtonStyle.Link);

    const selectRow = createSelectMenu(
        CATEGORY_SELECT_ID,
        "Sélectionner pour voir les commandes",
        options,
    );

    const buttonRow = new ActionRowBuilder().addComponents([
        bugReportButton,
        supportButton,
        touchpointButton,
    ]);

    return {
        embeds: [embed],
        components: [buttonRow, selectRow],
    };
}

export default {
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Affiche le menu d'aide avec toutes les commandes disponibles"),

    async execute(interaction, guildConfig, client) {
        
        const { MessageFlags } = await import('discord.js');
        await InteractionHelper.safeDefer(interaction);
        
        const { embeds, components } = await createInitialHelpMenu(client);

        await InteractionHelper.safeEditReply(interaction, {
            embeds,
            components,
        });

        setTimeout(async () => {
            try {
                const closedEmbed = createEmbed({
                    title: "Menu d'aide fermé",
                    description: "Le menu d'aide a été fermé. Utilisez /help pour l'ouvrir à nouveau.",
                    color: "secondary",
                });

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [closedEmbed],
                    components: [],
                });
            } catch (error) {
                
            }
        }, HELP_MENU_TIMEOUT_MS);
    },
};


