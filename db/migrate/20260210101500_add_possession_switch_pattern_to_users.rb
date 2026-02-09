class AddPossessionSwitchPatternToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :possession_switch_pattern, :string,
      null: false,
      default: "q12_q34"
  end
end
