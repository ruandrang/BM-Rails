class CreateClubs < ActiveRecord::Migration[8.1]
  def change
    create_table :clubs do |t|
      t.references :user, null: false, foreign_key: true
      t.string :name, null: false
      t.string :icon, null: false, default: "basketball"
      t.timestamps
    end
  end
end
