import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, warningEmbed } from '../../utils/embeds.js';
import { getConfirmationButtons } from '../../utils/components.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
        .setName('wipedata')
        .setDescription('Supprimer toutes vos données personnelles du bot (irréversible)'),

    async execute(interaction, guildConfig, client) {
        try {
            const warningMessage =
                `⚠️ **CETTE ACTION EST IRRÉVERSIBLE !** ⚠️\n\n` +
                `Cela supprimera définitivement **TOUTES** vos données de ce serveur, notamment :\n` +
                `• 💰 Solde économique (portefeuille & banque)\n` +
                `• 📊 Niveaux et XP\n` +
                `• 🎒 Objets d'inventaire\n` +
                `• 🛍️ Achats en boutique\n` +
                `• 🎂 Informations d'anniversaire\n` +
                `• 🔢 Données de compteur\n` +
                `• 📋 Toutes les autres données personnelles\n\n` +
                `**Cela ne peut pas être annulé. Êtes-vous absolument certain ?**`;

            const embed = warningEmbed(warningMessage, '🗑️ Supprimer toutes les données');

            const confirmButtons = getConfirmationButtons('wipedata');

            await InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                components: [confirmButtons],
                flags: MessageFlags.Ephemeral
            });

            logger.info(`Wipedata command executed - confirmation prompt shown`, {
                userId: interaction.user.id,
                guildId: interaction.guildId
            });
        } catch (error) {
            logger.error(`Wipedata command execution failed`, {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'wipedata'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'wipedata',
                source: 'wipedata_command'
            });
        }
    }
};




