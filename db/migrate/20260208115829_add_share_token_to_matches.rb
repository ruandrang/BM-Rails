class AddShareTokenToMatches < ActiveRecord::Migration[8.1]
  def change
    add_column :matches, :share_token, :string
    add_index :matches, :share_token, unique: true

    reversible do |dir|
      dir.up do
        Match.find_each do |match|
          match.update_column(:share_token, SecureRandom.urlsafe_base64(16))
        end
      end
    end
  end
end
