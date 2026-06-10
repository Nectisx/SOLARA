import { errorEmbed, successEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';
import { evaluateMathExpression } from '../utils/safeMathParser.js';

function evaluate(expression) {
    return evaluateMathExpression(expression);
}

async function calculateModalHandler(interaction, client, args) {
    try {
        const operation = args[0];
        const operandInput = interaction.fields.first();
        const contextKey = operandInput?.customId?.split(':')[1];
        
        if (!contextKey) {
            return await interaction.reply({
                embeds: [errorEmbed('❌ Erreur', 'Impossible de récupérer le contexte du calcul.')],
                flags: ['Ephemeral']
            });
        }

        const { calculationContexts } = await import('../commands/Tools/calculate.js');
        const context = calculationContexts.get(contextKey);
        
        if (!context) {
            return await interaction.reply({
                embeds: [errorEmbed('❌ Expiré', 'Ce calcul a expiré. Veuillez démarrer un nouveau calcul.')],
                flags: ['Ephemeral']
            });
        }

        await interaction.deferReply({ ephemeral: false });

        const operand = interaction.fields.getTextInputValue(operandInput.customId);
        
        if (!operand || isNaN(operand)) {
            return await interaction.editReply({
                embeds: [errorEmbed('❌ Entrée invalide', 'Veuillez fournir un nombre valide.')]
            });
        }

        const { expression, formattedResult, operator } = context;
        const newExpression = `(${expression}) ${operator} (${operand})`;

        let newResult;
        try {
            newResult = evaluate(newExpression);
            
            let formattedNewResult;
            if (typeof newResult === "number") {
                formattedNewResult = newResult.toLocaleString("en-US", {
                    maximumFractionDigits: 10,
                });

                if (
                    Math.abs(newResult) > 0 &&
                    (Math.abs(newResult) >= 1e10 || Math.abs(newResult) < 1e-3)
                ) {
                    formattedNewResult = newResult.toExponential(6);
                }
            } else {
                formattedNewResult = String(newResult);
            }

            const updatedEmbed = successEmbed(
                "🧮 Résultat du calcul",
                `**Expression :** \`${newExpression.replace(/`/g, "\`")}\`\n` +
                    `**Résultat :** \`${formattedNewResult}\`\n\n` +
                    `*Utilisez les boutons dans le message du salon pour effectuer d'autres opérations.*`,
            );

            try {
                if (context.messageId && context.channelId) {
                    const channel = await client.channels.fetch(context.channelId);
                    const message = await channel.messages.fetch(context.messageId);
                    await message.edit({
                        embeds: [updatedEmbed],
                    });
                }
            } catch (editError) {
                logger.warn('Could not edit original message:', editError.message);
            }

            calculationContexts.delete(contextKey);

            await interaction.editReply({
                embeds: [successEmbed('✅ Calculé', `\`${newExpression}\` = \`${formattedNewResult}\``)],
            });

        } catch (calcError) {
            logger.error('Calculate evaluation error:', calcError);
            await interaction.editReply({
                embeds: [errorEmbed("❌ Erreur de calcul", "Impossible d'évaluer l'expression.")],
            });
        }
    } catch (error) {
        logger.error('Calculate modal handler error:', error);
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    embeds: [errorEmbed('Erreur', 'Une erreur s\'est produite lors du traitement de votre calcul.')],
                    flags: ['Ephemeral']
                });
            } else {
                await interaction.editReply({
                    embeds: [errorEmbed('Erreur', 'Une erreur s\'est produite lors du traitement de votre calcul.')]
                });
            }
        } catch (err) {
            logger.error('Failed to send error message:', err);
        }
    }
}

export default {
    execute: calculateModalHandler
};
