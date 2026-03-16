class ClubJoinsController < ApplicationController
  def show
    @invitation = ClubInvitation.active.find_by!(code: params[:code])
    @club = @invitation.club
  rescue ActiveRecord::RecordNotFound
    redirect_to clubs_path, alert: t("club_joins.errors.invalid_code")
  end

  def create
    invitation = ClubInvitation.active.find_by!(code: params[:code])
    club = invitation.club

    if club.membership_for(current_user)
      redirect_to club_path(club), notice: t("club_joins.errors.already_member")
      return
    end

    ActiveRecord::Base.transaction do
      club.club_memberships.create!(
        user: current_user,
        role: "member",
        joined_at: Time.current
      )

      # Member 자동 생성 (선수 명단에 추가)
      @member = club.members.create!(
        user: current_user,
        name: current_user.display_name,
        position: "PG",
        sort_order: (club.members.maximum(:sort_order).to_i + 1)
      )
    end
    invitation.use!

    # 프로필 입력 화면으로 리다이렉트
    redirect_to edit_profile_club_member_path(club, @member),
                notice: t("club_joins.notices.joined_fill_profile")
  rescue ActiveRecord::RecordNotFound
    redirect_to clubs_path, alert: t("club_joins.errors.invalid_code")
  end
end
