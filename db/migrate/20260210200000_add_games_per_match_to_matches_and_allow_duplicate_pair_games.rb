class AddGamesPerMatchToMatchesAndAllowDuplicatePairGames < ActiveRecord::Migration[8.1]
  def change
    add_column :matches, :games_per_match, :integer, default: 1, null: false

    remove_index :games, name: "index_games_on_match_id_and_home_team_id_and_away_team_id"
    add_index :games, [ :match_id, :home_team_id, :away_team_id ], name: "index_games_on_match_id_and_home_team_id_and_away_team_id"
  end
end
