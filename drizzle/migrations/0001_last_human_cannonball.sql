ALTER TABLE "game_events" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "games" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "players" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "predictions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "seasons" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "standings" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "teams" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_scores" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP INDEX "game_events_game_event_number_idx";--> statement-breakpoint
DROP INDEX "games_featured_status_idx";--> statement-breakpoint
DROP INDEX "games_season_week_idx";--> statement-breakpoint
DROP INDEX "games_status_idx";--> statement-breakpoint
DROP INDEX "predictions_user_game_idx";--> statement-breakpoint
DROP INDEX "standings_season_team_idx";--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "scheduled_at" timestamp;--> statement-breakpoint
CREATE UNIQUE INDEX "game_events_game_event_number_idx" ON "game_events" USING btree ("game_id","event_number");--> statement-breakpoint
CREATE INDEX "games_featured_status_idx" ON "games" USING btree ("is_featured","status");--> statement-breakpoint
CREATE INDEX "games_season_week_idx" ON "games" USING btree ("season_id","week");--> statement-breakpoint
CREATE INDEX "games_status_idx" ON "games" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "predictions_user_game_idx" ON "predictions" USING btree ("user_id","game_id");--> statement-breakpoint
CREATE UNIQUE INDEX "standings_season_team_idx" ON "standings" USING btree ("season_id","team_id");