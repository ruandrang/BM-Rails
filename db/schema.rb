# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_02_10_101500) do
  create_table "clubs", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.text "description"
    t.string "icon", default: "basketball", null: false
    t.json "meeting_days", default: []
    t.string "name", null: false
    t.datetime "updated_at", null: false
    t.integer "user_id", null: false
    t.index ["user_id"], name: "index_clubs_on_user_id"
  end

  create_table "games", force: :cascade do |t|
    t.integer "away_score", default: 0
    t.integer "away_team_id", null: false
    t.datetime "created_at", null: false
    t.integer "home_score", default: 0
    t.integer "home_team_id", null: false
    t.integer "match_id", null: false
    t.json "quarter_scores", default: {}
    t.string "result", default: "pending", null: false
    t.datetime "updated_at", null: false
    t.index ["away_team_id"], name: "index_games_on_away_team_id"
    t.index ["home_team_id"], name: "index_games_on_home_team_id"
    t.index ["match_id", "home_team_id", "away_team_id"], name: "index_games_on_match_id_and_home_team_id_and_away_team_id", unique: true
    t.index ["match_id"], name: "index_games_on_match_id"
  end

  create_table "matches", force: :cascade do |t|
    t.integer "club_id", null: false
    t.datetime "created_at", null: false
    t.text "note"
    t.date "played_on", null: false
    t.string "share_token"
    t.integer "teams_count", default: 2, null: false
    t.datetime "updated_at", null: false
    t.index ["club_id"], name: "index_matches_on_club_id"
    t.index ["share_token"], name: "index_matches_on_share_token", unique: true
  end

  create_table "members", force: :cascade do |t|
    t.integer "age"
    t.integer "club_id", null: false
    t.datetime "created_at", null: false
    t.integer "height_cm"
    t.integer "jersey_number"
    t.string "name", null: false
    t.string "position", null: false
    t.integer "sort_order", default: 0, null: false
    t.datetime "updated_at", null: false
    t.index ["club_id", "sort_order"], name: "index_members_on_club_id_and_sort_order"
    t.index ["club_id"], name: "index_members_on_club_id"
  end

  create_table "team_members", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "member_id", null: false
    t.integer "team_id", null: false
    t.datetime "updated_at", null: false
    t.index ["member_id"], name: "index_team_members_on_member_id"
    t.index ["team_id", "member_id"], name: "index_team_members_on_team_id_and_member_id", unique: true
    t.index ["team_id"], name: "index_team_members_on_team_id"
  end

  create_table "teams", force: :cascade do |t|
    t.string "color", null: false
    t.datetime "created_at", null: false
    t.string "label", null: false
    t.integer "match_id", null: false
    t.datetime "updated_at", null: false
    t.index ["match_id"], name: "index_teams_on_match_id"
  end

  create_table "users", force: :cascade do |t|
    t.boolean "admin", default: false, null: false
    t.datetime "created_at", null: false
    t.integer "default_game_minutes", default: 8, null: false
    t.string "email", null: false
    t.string "name"
    t.string "password_digest", null: false
    t.string "possession_switch_pattern", default: "q12_q34", null: false
    t.boolean "scoreboard_sound_enabled", default: true, null: false
    t.datetime "updated_at", null: false
    t.boolean "voice_announcement_enabled", default: true, null: false
    t.index ["email"], name: "index_users_on_email", unique: true
  end

  add_foreign_key "clubs", "users"
  add_foreign_key "games", "matches"
  add_foreign_key "games", "teams", column: "away_team_id"
  add_foreign_key "games", "teams", column: "home_team_id"
  add_foreign_key "matches", "clubs"
  add_foreign_key "members", "clubs"
  add_foreign_key "team_members", "members"
  add_foreign_key "team_members", "teams"
  add_foreign_key "teams", "matches"
end
