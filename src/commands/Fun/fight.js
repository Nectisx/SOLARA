import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const EMBED_DESCRIPTION_LIMIT = 4096;

export default {
    data: new SlashCommandBuilder()
    .setName("fight")
    .setDescription("Lance un combat textuel simulé en 1 contre 1.")
    .addUserOption((option) =>
      option
        .setName("opponent")
        .setDescription("L'utilisateur contre qui se battre.")
        .setRequired(true),
    ),
  category: 'Fun',

  async execute(interaction, config, client) {
    try {
      await InteractionHelper.safeDefer(interaction);

      const challenger = interaction.user;
      const opponent = interaction.options.getUser("opponent");

      
      if (challenger.id === opponent.id) {
        const embed = warningEmbed(
          `**${challenger.username}**, vous ne pouvez pas vous battre contre vous-même ! C'est un match nul avant même de commencer.`,
          "⚔️ Défi invalide"
        );
        return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }


      if (opponent.bot) {
        const embed = warningEmbed(
          "Vous ne pouvez pas combattre des bots ! Défiez plutôt une vraie personne.",
          "⚔️ Adversaire invalide"
        );
        return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      const winner = rand(0, 1) === 0 ? challenger : opponent;
      const loser = winner.id === challenger.id ? opponent : challenger;
      const rounds = rand(3, 7);
      const damage = rand(10, 50);

      const log = [];
      log.push(
        `💥 **${challenger.username}** défie **${opponent.username}** en duel ! (Au meilleur de ${rounds} rounds)`,
      );

      for (let i = 1; i <= rounds; i++) {
        const attacker = rand(0, 1) === 0 ? challenger : opponent;
        const target = attacker.id === challenger.id ? opponent : challenger;
        const action = [
          "lance un coup sauvage",
          "porte un coup critique",
          "utilise un sort faible",
          "pare et contre-attaque",
        ][rand(0, 3)];
        log.push(
          `\n**Round ${i} :** ${attacker.username} ${action} sur ${target.username} pour ${rand(1, damage)} dégâts !`,
        );
      }

      const outcomeText = log.join("\n");
      const winnerText = `👑 **${winner.username}** a vaincu ${loser.username} et remporte la victoire !`;
      const fullDescription = `${outcomeText}\n\n${winnerText}`;

      const description = fullDescription.length <= EMBED_DESCRIPTION_LIMIT
        ? fullDescription
        : `${fullDescription.slice(0, EMBED_DESCRIPTION_LIMIT - 15)}\n\n...`;

      const embed = successEmbed(
        description,
        "🏆 Duel terminé !"
      );

      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      logger.debug(`Fight command executed between ${challenger.id} and ${opponent.id} in guild ${interaction.guildId}`);
    } catch (error) {
      logger.error('Fight command error:', error);
      await handleInteractionError(interaction, error, {
        commandName: 'fight',
        source: 'fight_command'
      });
    }
  },
};





