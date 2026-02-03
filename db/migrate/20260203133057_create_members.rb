class CreateMembers < ActiveRecord::Migration[8.1]
  def change
    create_table :members do |t|
      t.references :club, null: false, foreign_key: true
      t.string :name, null: false
      t.integer :age
      t.integer :height_cm
      t.string :position, null: false
      t.integer :jersey_number
      t.integer :sort_order, null: false, default: 0
      t.timestamps
    end

    add_index :members, [ :club_id, :sort_order ]
  end
end
