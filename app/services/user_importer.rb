class UserImporter
  def initialize(user, payload)
    @user = user
    @payload = payload
  end

  def call
    total_stats = { clubs_added: 0, clubs_merged: 0, members_added: 0, members_skipped: 0, matches_added: 0, matches_skipped: 0 }

    ActiveRecord::Base.transaction do
      existing_clubs = @user.clubs.index_by { |c| c.name.to_s.strip.downcase }

      Array(@payload["clubs"]).each do |club_data|
        club_name = club_data.dig("club", "name").to_s.strip
        club_name_key = club_name.downcase

        club = existing_clubs[club_name_key]

        if club
          total_stats[:clubs_merged] += 1
        else
          club = @user.clubs.create!(name: club_name, icon: "basketball")
          existing_clubs[club_name_key] = club
          total_stats[:clubs_added] += 1
        end

        stats = ClubImporter.new(club, club_data).call
        total_stats[:members_added] += stats[:members_added]
        total_stats[:members_skipped] += stats[:members_skipped]
        total_stats[:matches_added] += stats[:matches_added]
        total_stats[:matches_skipped] += stats[:matches_skipped]
      end
    end

    total_stats
  end
end
