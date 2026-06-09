import { MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { deleteBirthday } from '../../../services/birthdayService.js';
import { logger } from '../../../utils/logger.js';
import { handleInteractionError } from '../../../utils/errorHandler.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
export default {
    async execute(interaction, config, client) {
        try {
            await InteractionHelper.safeDefer(interaction);

            const userId = interaction.user.id;
            const guildId = interaction.guildId;

            
            const result = await deleteBirthday(client, guildId, userId);

            if (result.success) {
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed(
                        "Votre anniversaire a été supprimé du serveur avec succès.",
                        "Anniversaire supprimé 🗑️"
                    )]
                });
            } else if (result.notFound) {
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [createEmbed({
                        title: '❌ Aucun anniversaire trouvé',
                        description: "Vous n'avez pas d'anniversaire défini à supprimer.",
                        color: 'error'
                    })]
                });
            }
        } catch (error) {
            logger.error("Birthday remove command execution failed", {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'birthday_remove'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'birthday_remove',
                source: 'birthday_remove_module'
            });
        }
    }
};



