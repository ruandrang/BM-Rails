class AddQuarterScoresToGames < ActiveRecord::Migration[8.1]
  def change
    add_column :games, :quarter_scores, :jsonb, default: {}
  end
end
