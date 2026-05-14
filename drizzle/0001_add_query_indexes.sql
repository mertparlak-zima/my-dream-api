CREATE INDEX "interpreters_active_sort_idx" ON "interpreters" USING btree ("is_active","sort_order");--> statement-breakpoint
CREATE INDEX "interpreters_model_id_idx" ON "interpreters" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "dreams_user_created_at_idx" ON "dreams" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "dreams_user_status_idx" ON "dreams" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "dreams_interpreter_id_idx" ON "dreams" USING btree ("interpreter_id");--> statement-breakpoint
CREATE INDEX "credit_transactions_user_created_at_idx" ON "credit_transactions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "credit_transactions_related_dream_id_idx" ON "credit_transactions" USING btree ("related_dream_id");