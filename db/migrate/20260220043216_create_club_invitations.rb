class CreateClubInvitations < ActiveRecord::Migration[8.1]
  def change
    create_table :club_invitations do |t|
      t.references :club, null: false, foreign_key: true
      t.string :code, null: false
      t.references :created_by, null: false, foreign_key: { to_table: :users }
      t.datetime :expires_at
      t.integer :max_uses
      t.integer :use_count, null: false, default: 0
      t.timestamps
    end

    add_index :club_invitations, :code, unique: true
  end
end
