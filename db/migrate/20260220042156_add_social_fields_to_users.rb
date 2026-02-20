class AddSocialFieldsToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :nickname, :string
    add_column :users, :avatar_url, :string
    change_column_null :users, :password_digest, true

    reversible do |dir|
      dir.up do
        execute "UPDATE users SET nickname = name WHERE nickname IS NULL"
      end
    end
  end
end
