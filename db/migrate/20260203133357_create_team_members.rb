class CreateTeamMembers < ActiveRecord::Migration[8.1]
  def change
    create_table :team_members do |t|
      t.references :team, null: false, foreign_key: true
      t.references :member, null: false, foreign_key: true
      t.timestamps
    end

    add_index :team_members, [ :team_id, :member_id ], unique: true
  end
end
