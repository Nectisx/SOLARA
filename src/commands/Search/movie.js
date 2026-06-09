import axios from 'axios';
import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getGuildConfig } from '../../services/guildConfig.js';
import { getColor } from '../../config/bot.js';

const TMDB_API_KEY = process.env.TMDB_API_KEY || '4e44d9029b1270a757cddc766a1bcb63';
    "4e44d9029b1270a757cddc766a1bcb63";
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";
const MAX_RESULTS = 5;

export default {
    data: new SlashCommandBuilder()
        .setName("movie")
        .setDescription("Rechercher un film ou une série TV")
        .addStringOption((option) =>
            option
                .setName("title")
                .setDescription("Le titre du film ou de la série TV")
                .setRequired(true)
                .setMaxLength(100),
        )
        .addStringOption((option) =>
            option
                .setName("type")
                .setDescription("Type de contenu à rechercher")
                .addChoices(
                    { name: "Film", value: "movie" },
                    { name: "Série TV", value: "tv" },
                )
                .setRequired(false),
        ),
    async execute(interaction) {
        try {
            
            const deferred = await InteractionHelper.safeDefer(interaction);
            if (!deferred) {
                return;
            }

            const guildConfig = await getGuildConfig(
                interaction.client,
                interaction.guild?.id,
            );
            if (guildConfig?.disabledCommands?.includes("movie")) {
                logger.warn('Movie command disabled in guild', {
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'movie'
                });
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Commande désactivée",
                            "La commande de recherche de films/séries TV est désactivée sur ce serveur.",
                        ),
                    ],
                    flags: MessageFlags.Ephemeral,
                });
            }

            if (!TMDB_API_KEY) {
                logger.error('TMDB API key not configured', {
                    guildId: interaction.guildId,
                    commandName: 'movie'
                });
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Erreur de configuration",
                            "La recherche de films/séries TV n'est pas correctement configurée.",
                        ),
                    ],
                    flags: MessageFlags.Ephemeral,
                });
            }

            const title = interaction.options.getString("title");
            const type = interaction.options.getString("type") || "movie";

            logger.debug('Movie search initiated', {
                userId: interaction.user.id,
                title: title,
                type: type,
                guildId: interaction.guildId
            });

            const searchResponse = await axios.get(
                `https://api.themoviedb.org/3/search/${type}`,
                {
                    params: {
                        api_key: TMDB_API_KEY,
                        query: title,
                        include_adult: guildConfig?.allowNsfwContent
                            ? undefined
                            : false,
                        language: guildConfig?.language || "en-US",
                        page: 1,
                        region: guildConfig?.region || "US",
                    },
timeout: 8000,
                },
            );

            if (!searchResponse.data?.results?.length) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Introuvable",
                            `Aucun ${type === "movie" ? "film" : "série TV"} trouvé pour "${title}".`,
                        ),
                    ],
                });
            }

            const result = searchResponse.data.results[0];
            const mediaType = type === "movie" ? "Film" : "Série TV";
            const mediaTitle = result.title || result.name || "Titre inconnu";
            const releaseDate = result.release_date || result.first_air_date;
            const year = releaseDate
                ? new Date(releaseDate).getFullYear()
                : "N/A";

            const detailsResponse = await axios.get(
                `https://api.themoviedb.org/3/${type}/${result.id}`,
                {
                    params: {
                        api_key: TMDB_API_KEY,
                        language: guildConfig?.language || "en-US",
                        append_to_response:
                            "credits,release_dates,content_ratings",
                    },
                    timeout: 8000,
                },
            );

            const details = detailsResponse.data;
            const runtime = details.runtime
                ? `${Math.floor(details.runtime / 60)}h ${details.runtime % 60}m`
                : details.episode_run_time?.[0]
                  ? `${details.episode_run_time[0]}m par épisode`
                  : "N/A";

            let contentRating = "N/A";
            if (type === "movie") {
                const usCert = details.release_dates?.results?.find(
                    (r) => r.iso_3166_1 === "US",
                );
                if (usCert?.release_dates?.[0]?.certification) {
                    contentRating = usCert.release_dates[0].certification;
                }
            } else {
                const usCert = details.content_ratings?.results?.find(
                    (r) => r.iso_3166_1 === "US",
                );
                if (usCert?.rating) {
                    contentRating = usCert.rating;
                }
            }

            const genres =
                details.genres?.map((g) => g.name).join(", ") || "N/A";

            const cast =
                details.credits?.cast
                    ?.slice(0, 3)
                    .map((p) => p.name)
                    .join(", ") || "N/A";

            const embed = createEmbed({
                title: `${mediaTitle} (${year})`,
                description: details.overview || "Aucun résumé disponible.",
                color: 'info'
            })
                .setURL(`https://www.themoviedb.org/${type}/${result.id}`)
                .setThumbnail(
                    result.poster_path
                        ? `${IMAGE_BASE_URL}${result.poster_path}`
                        : null,
                )
                .addFields(
                    { name: "Type", value: mediaType, inline: true },
                    {
                        name: "Note",
                        value: result.vote_average
                            ? `⭐ ${result.vote_average.toFixed(1)}/10 (${result.vote_count.toLocaleString()} votes)`
                            : "N/A",
                        inline: true,
                    },
                    {
                        name: "Classification",
                        value: contentRating,
                        inline: true,
                    },
                    { name: "Durée", value: runtime, inline: true },
                    {
                        name: "Date de sortie",
                        value: releaseDate
                            ? new Date(releaseDate).toLocaleDateString()
                            : "N/A",
                        inline: true,
                    },
                    { name: "Genres", value: genres, inline: true },
                    { name: "Casting", value: cast, inline: false },
                )
                .setFooter({
                    text: "Propulsé par The Movie Database",
                    iconURL:
                        "https://www.themoviedb.org/assets/2/v4/logos/v2/blue_square_1-5bdc75aaebeb75dc7ae79426ddd9be3b2be1e342510f8202baf6bffa71d7f5c4.svg",
                });

            if (result.backdrop_path) {
                embed.setImage(
                    `https://image.tmdb.org/t/p/w1280${result.backdrop_path}`,
                );
            }

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            
            logger.info('Movie information retrieved', {
                userId: interaction.user.id,
                title: title,
                type: type,
                resultTitle: mediaTitle,
                guildId: interaction.guildId,
                commandName: 'movie'
            });
        } catch (error) {
            logger.error('Movie/TV show search error', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                apiStatus: error.response?.status,
                commandName: 'movie'
            });

            
            if (error.response?.status === 404) {
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Introuvable', 'Le film/la série TV demandé(e) est introuvable.')]
                });
            } else if (error.response?.status === 401) {
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Erreur de configuration', 'Clé API TMDB invalide. Veuillez contacter l\'administrateur du bot.')],
                    flags: MessageFlags.Ephemeral
                });
            } else {
                await handleInteractionError(interaction, error, {
                    commandName: 'movie',
                    source: 'tmdb_api'
                });
            }
        }
    },
};


