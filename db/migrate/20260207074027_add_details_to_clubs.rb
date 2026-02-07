class AddDetailsToClubs < ActiveRecord::Migration[8.1]
  def change
    add_column :clubs, :description, :text
    add_column :clubs, :regular_meeting_day, :string
  end
end
