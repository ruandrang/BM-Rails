class CreateGames < ActiveRecord::Migration[8.1]
  def change
    create_table :games do |t|
      t.references :match, null: false, foreign_key: true
      t.references :home_team, null: false, foreign_key: { to_table: :teams }
      t.references :away_team, null: false, foreign_key: { to_table: :teams }
      t.string :result, null: false, default: "pending"
      t.timestamps
    end

    add_index :games, [ :match_id, :home_team_id, :away_team_id ], unique: true
  end
end
