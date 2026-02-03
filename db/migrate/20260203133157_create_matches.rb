class CreateMatches < ActiveRecord::Migration[8.1]
  def change
    create_table :matches do |t|
      t.references :club, null: false, foreign_key: true
      t.date :played_on, null: false
      t.integer :teams_count, null: false, default: 2
      t.text :note
      t.timestamps
    end
  end
end
