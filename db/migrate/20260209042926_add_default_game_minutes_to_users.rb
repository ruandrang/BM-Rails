class AddDefaultGameMinutesToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :default_game_minutes, :integer, null: false, default: 8
  end
end
