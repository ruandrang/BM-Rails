class CreateClubMemberships < ActiveRecord::Migration[8.1]
  def change
    create_table :club_memberships do |t|
      t.references :user, null: false, foreign_key: true
      t.references :club, null: false, foreign_key: true
      t.string :role, null: false, default: "member"
      t.datetime :joined_at, null: false
      t.references :invited_by, null: true, foreign_key: { to_table: :users }

      t.timestamps
    end

    add_index :club_memberships, [ :user_id, :club_id ], unique: true
    add_index :club_memberships, [ :club_id, :role ]

    # 기존 데이터: clubs.user_id → ClubMembership(owner)
    reversible do |dir|
      dir.up do
        execute <<~SQL
          INSERT INTO club_memberships (user_id, club_id, role, joined_at, created_at, updated_at)
          SELECT user_id, id, 'owner', created_at, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          FROM clubs
        SQL
      end
    end
  end
end
