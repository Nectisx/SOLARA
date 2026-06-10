import { errorEmbed, successEmbed } from '../utils/embeds.js';
import { WarningService } from '../services/warningService.js';
import { InteractionHelper } from '../utils/interactionHelper.js';
import { logger } from '../utils/logger.js';

async function warningDeleteModalHandler(interaction, client) {
  try {
    const [, targetUserId, originalModeratorId] = interaction.customId.split(':');
    
    if (interaction.user.id !== originalModeratorId) {
      return await interaction.reply({
        embeds: [errorEmbed('❌ Permission refusée', 'Seul le modérateur d\'origine peut supprimer les avertissements.')],
        flags: ['Ephemeral']
      });
    }

    const warningNumberInput = interaction.fields.getTextInputValue('warning_number');
    const warningNumber = parseInt(warningNumberInput.replace('#', '').trim(), 10);

    if (isNaN(warningNumber) || warningNumber < 1) {
      return await interaction.reply({
        embeds: [errorEmbed('❌ Saisie invalide', 'Veuillez entrer un numéro d\'avertissement valide (ex. : 1, 2, 3).')],
        flags: ['Ephemeral']
      });
    }

    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;

    const guildId = interaction.guildId;
    const warnings = await WarningService.getWarnings(guildId, targetUserId);

    if (warningNumber > warnings.length) {
      return await interaction.editReply({
        embeds: [errorEmbed('❌ Avertissement introuvable', `L'avertissement #${warningNumber} n'existe pas. Cet utilisateur n'a que ${warnings.length} avertissement(s).`)]
      });
    }

    const warningToDelete = warnings[warningNumber - 1];
    const result = await WarningService.removeWarning(guildId, targetUserId, warningToDelete.id);

    if (!result.success) {
      throw new Error(result.error || 'Failed to delete warning');
    }

    const targetUser = await client.users.fetch(targetUserId).catch(() => null);
    const targetName = targetUser ? targetUser.username : 'the user';

    logger.info(`[MODERATION] Warning deleted for ${targetUserId} in ${guildId} by ${interaction.user.id}`, {
      warningId: warningToDelete.id,
      reason: warningToDelete.reason,
      warningNumber
    });

    await interaction.editReply({
      embeds: [successEmbed('✅ Avertissement supprimé', `L'avertissement #${warningNumber} de **${targetName}** a été supprimé.\n\n**Raison :** ${warningToDelete.reason.substring(0, 100)}`)]
    });
  } catch (error) {
    logger.error('Warning delete modal handler error:', error);
    await interaction.editReply({
      embeds: [errorEmbed('❌ Erreur', 'Impossible de supprimer l\'avertissement.')]
    });
  }
}

async function warningClearConfirmModalHandler(interaction, client) {
  try {
    const [, targetUserId, originalModeratorId] = interaction.customId.split(':');
    
    if (interaction.user.id !== originalModeratorId) {
      return await interaction.reply({
        embeds: [errorEmbed('❌ Permission refusée', 'Seul le modérateur d\'origine peut effacer les avertissements.')],
        flags: ['Ephemeral']
      });
    }

    const confirmation = interaction.fields.getTextInputValue('delete_confirmation').trim();

    if (confirmation !== 'DELETE') {
      return await interaction.reply({
        embeds: [errorEmbed('❌ Confirmation incorrecte', 'Vous devez taper exactement "DELETE" pour confirmer la suppression de tous les avertissements.')],
        flags: ['Ephemeral']
      });
    }

    await interaction.deferReply({ flags: ['Ephemeral'] });

    const guildId = interaction.guildId;
    const result = await WarningService.clearWarnings(guildId, targetUserId);

    if (!result.success) {
      throw new Error(result.error || 'Failed to clear warnings');
    }

    const targetUser = await client.users.fetch(targetUserId).catch(() => null);
    const targetName = targetUser ? targetUser.username : 'the user';

    logger.info(`[MODERATION] All warnings cleared for ${targetUserId} in ${guildId} by ${interaction.user.id}`);

    await interaction.editReply({
      embeds: [successEmbed('✅ Avertissements effacés', `Tous les avertissements de **${targetName}** ont été effacés. **${result.count}** avertissement(s) supprimé(s).`)]
    });
  } catch (error) {
    logger.error('Warning clear confirm modal handler error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        embeds: [errorEmbed('❌ Erreur', 'Impossible d\'effacer les avertissements.')],
        flags: ['Ephemeral']
      });
    } else {
      await interaction.editReply({
        embeds: [errorEmbed('❌ Error', 'Failed to clear warnings.')]
      });
    }
  }
}

export { warningDeleteModalHandler, warningClearConfirmModalHandler };

export default {
  name: 'warning_delete_modal',
  execute: warningDeleteModalHandler
};
