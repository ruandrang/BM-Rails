class AddVoiceAnnouncementRateToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :voice_announcement_rate, :float, default: 1.0, null: false
  end
end
