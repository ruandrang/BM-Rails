class UserImporter
  def initialize(user, payload)
    @user = user
    @payload = payload
  end

  def call
    ActiveRecord::Base.transaction do
      # 기존 클럽 데이터 모두 삭제
      @user.clubs.destroy_all

      # 클럽 데이터 복원
      Array(@payload["clubs"]).each do |club_data|
        # ClubImporter가 업데이트 방식으로 동작하므로,
        # 일단 빈 클럽을 생성한 후 Importer에게 위임
        # (ClubImporter 내부에서 name, icon 등을 다시 update 함)
        club = @user.clubs.create!(name: "Restoring...", icon: "basketball")
        ClubImporter.new(club, club_data).call
      end
    end
  end
end
