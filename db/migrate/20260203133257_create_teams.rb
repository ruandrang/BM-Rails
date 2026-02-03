class CreateTeams < ActiveRecord::Migration[8.1]
  def change
    create_table :teams do |t|
      t.references :match, null: false, foreign_key: true
      t.string :label, null: false
      t.string :color, null: false
      t.timestamps
    end
  end
end
