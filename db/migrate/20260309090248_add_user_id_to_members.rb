class AddUserIdToMembers < ActiveRecord::Migration[8.1]
  def change
    add_reference :members, :user, null: true, foreign_key: true

    # 초대 코드 가입 Member는 클럽당 1명만 허용 (수동 등록 Member는 user_id=null이므로 제약 없음)
    add_index :members, [ :club_id, :user_id ],
              unique: true,
              where: "user_id IS NOT NULL",
              name: "index_members_on_club_user_unique"
  end
end
