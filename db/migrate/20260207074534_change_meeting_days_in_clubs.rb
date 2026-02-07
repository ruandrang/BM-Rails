class ChangeMeetingDaysInClubs < ActiveRecord::Migration[8.1]
  def change
    remove_column :clubs, :regular_meeting_day, :string
    add_column :clubs, :meeting_days, :json, default: []
  end
end
