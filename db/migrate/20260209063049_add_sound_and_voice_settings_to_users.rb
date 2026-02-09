class AddSoundAndVoiceSettingsToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :scoreboard_sound_enabled, :boolean, default: true, null: false
    add_column :users, :voice_announcement_enabled, :boolean, default: true, null: false
  end
end
